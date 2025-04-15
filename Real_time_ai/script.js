// Grab elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Initialize the brain.js network early.
const net = new brain.NeuralNetwork();

// Global variable to store the processed keypoints.
let usedKeypoints = null;

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  return new Promise(resolve => {
    video.onloadedmetadata = () => resolve(video);
  });
}

// Helper function for flipping the x coordinate.
function flipX(x) {
  return canvas.width - x;
}

// Draw a point on the canvas (optional visualization).
function drawPoint(x, y, color = 'lime', size = 7) {
  ctx.beginPath();
  ctx.arc(x, y, size, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

// Draw connection between two keypoints (optional visualization).
function drawConnection(p1, p2, scale = 1, tooFar = false) {
  const x1 = flipX(p1.x);
  const y1 = p1.y;
  const x2 = flipX(p2.x);
  const y2 = p2.y;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = tooFar ? 'red' : 'lime';
  ctx.lineWidth = Math.max(1, 20 / scale);
  ctx.stroke();
}

// Calculate Euclidean distance.
function getDistance(a, b) {
  return (a?.score > 0.4 && b?.score > 0.4)
    ? Math.hypot(a.x - b.x, a.y - b.y)
    : null;
}

// getDepthScale remains unchanged.
function getDepthScale(k) {
  const pairs = [
    getDistance(k[5], k[6]),  // shoulders
    getDistance(k[11], k[12]), // hips
    getDistance(k[7], k[8])    // elbows
  ];
  const valid = pairs.filter(v => v !== null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b) / valid.length : 200;
}

async function main() {
  await tf.setBackend('webgl');
  await setupCamera();
  
  const detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
  );
  
  video.play();
  
  async function detectPose() {
    
    const poses = await detector.estimatePoses(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw video in mirror view.
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    
    if (poses.length > 0 && poses[0].keypoints) {
      const k = poses[0].keypoints;
      // Extract keypoints of interest.
      const leftElbow  = k[7], rightElbow = k[8];
      const leftWrist  = k[9], rightWrist = k[10];
      const leftHip    = k[11], rightHip   = k[12];
      const leftEar    = k[3], rightEar   = k[4];
      
      // Calculate jaw points.
      const leftJaw = { x: leftEar.x, y: leftEar.y + 35, score: leftEar.score };
      const rightJaw = { x: rightEar.x, y: rightEar.y + 35, score: rightEar.score };
      
      // Optionally calculate head center for visualization only.
      const headCenter = (leftEar.score > 0.4 && rightEar.score > 0.4) ? {
        x: (leftEar.x + rightEar.x) / 2,
        y: Math.min(leftEar.y, rightEar.y) - 50,
        score: 1.0
      } : null;
      
      // Build the raw keypoints object.
      const rawKeypoints = {
        leftElbow, rightElbow,
        leftWrist, rightWrist,
        leftHip, rightHip,
        leftEar, rightEar,
        leftJaw, rightJaw,
        headCenter // for display only
      };
      
      // CHANGE: Calculate the hip center for normalization.
      const hipCenter = {
        x: (leftHip.x + rightHip.x) / 2,
        y: (leftHip.y + rightHip.y) / 2
      };
      
      // ADDED: Compute depth scale for normalization.
      const depthScale = getDepthScale(k);
      
      // Define a function to normalize each keypoint relative to hipCenter.
      function normalizeKeypoint(p) {
        return {
          x: (p.x - hipCenter.x) / depthScale,
          y: (p.y - hipCenter.y) / depthScale,
          score: p.score
        };
      }
      const normalizedKeypoints = {};
      for (const [key, point] of Object.entries(rawKeypoints)) {
        normalizedKeypoints[key] = point ? normalizeKeypoint(point) : null;
      }
      
      // ADDED: Check if left handed checkbox is checked.
      const leftHandedToggle = document.getElementById('leftHandedToggle');
      if (leftHandedToggle && leftHandedToggle.checked) {
        // Mirror the normalized x coordinates.
        for (const key in normalizedKeypoints) {
          if (normalizedKeypoints[key]) {
            normalizedKeypoints[key].x = -normalizedKeypoints[key].x;
          }
        }
      }
      
      // Use the normalized keypoints as our final processed keypoints.
      usedKeypoints = normalizedKeypoints;
      
      // (Optional) Visualization using the original positions.
      [leftJaw, rightJaw, leftHip, rightHip, headCenter]
        .filter(p => p && p.score > 0.4)
        .forEach(p => drawPoint(flipX(p.x), p.y, 'blue'));
      [leftElbow, rightElbow, leftWrist, rightWrist]
        .filter(p => p && p.score > 0.4)
        .forEach(p => drawPoint(flipX(p.x), p.y, 'lime'));
      
      // (Optional) Draw connections using original positions.
      const scale = getDepthScale(k) || 200;
      const dLE = getDistance(leftHip, leftElbow);
      if (dLE !== null) drawConnection(leftHip, leftElbow, scale, false);
      const dRE = getDistance(rightHip, rightElbow);
      if (dRE !== null) drawConnection(rightHip, rightElbow, scale, false);
      const dLW = getDistance(leftWrist, leftJaw);
      if (dLW !== null) drawConnection(leftWrist, leftJaw, scale, false);
      const dRW = getDistance(rightWrist, rightJaw);
      if (dRW !== null) drawConnection(rightWrist, rightJaw, scale, false);
      
      // CHANGE: After processing keypoints, update dynamic feedback.
      // Flatten the normalized keypoints.
      const flatInput = flattenKeypoints(usedKeypoints);
      // Run the trained brain.js network (the network is now assumed fully trained).
      const prediction = net.run(flatInput);
      // Update the feedback display and log to console.
      updateFeedback(prediction);
    }
    requestAnimationFrame(detectPose);
  }
  
  detectPose();
}

// Function to flatten the processed keypoints into a simple key-value format.
function flattenKeypoints(kp) {
  const flat = {};
  for (const key in kp) {
    if (kp[key]) {
      flat[`${key}_x`] = kp[key].x;
      flat[`${key}_y`] = kp[key].y;
    }
  }
  return flat;
}
// Function to construct the output object from the checkboxes.
function getOutputFromCheckboxes() {
  return {
    leftElbow: document.getElementById('leftElbow').checked ? 1 : 0,
    rightElbow: document.getElementById('rightElbow').checked ? 1 : 0,
    leftWrist: document.getElementById('leftWrist').checked ? 1 : 0,
    rightWrist: document.getElementById('rightWrist').checked ? 1 : 0,
    leftHip: document.getElementById('leftHip').checked ? 1 : 0,
    rightHip: document.getElementById('rightHip').checked ? 1 : 0,
    head: document.getElementById('head').checked ? 1 : 0
  };
}

// Log the flattened keypoints as input and output from checkboxes.
const logInputButton = document.getElementById('logInputButton');
logInputButton.addEventListener('click', () => {
  if (usedKeypoints) {
    const flatInput = flattenKeypoints(usedKeypoints);
    const output = getOutputFromCheckboxes();
    const trainingSample = { input: flatInput, output: output };
    console.log("Training Sample:\n", JSON.stringify(trainingSample, null, 2));
  } else {
    console.log("No keypoints detected yet.");
  }
});

// --------------------------------------------------------------------------------------------
// CHANGE: Add dynamic feedback update function.
// This function takes the prediction from the neural network and updates the .feedback div.
function updateFeedback(prediction) {
  let message = "";
  if (prediction.leftElbow <0.5 ) {
    message += "Left elbow is out of guard!<br>";
  }
  if (prediction.rightElbow <0.5) {
    message += "Right elbow is out of guard!<br>";
  }
  if (prediction.leftWrist <0.5) {
    message += "Left wrist open!<br>";
  }
  if (prediction.rightWrist <0.5) {
    message += "Right wrist open!<br>";
  }
  if (prediction.leftHip<0.5) {
    message += "Left hip needs adjustment!<br>";
  }
  if (prediction.rightHip <0.5) {
    message += "Right hip needs adjustment!<br>";
  }
  if (prediction.head <0.5 ) {
    message += "Head protection is compromised!<br>";
  }
  if (!message) {
    message = "Guard is solid!";
  }
  // CHANGE: Log the feedback message to the console (replacing <br> with a space).
  document.querySelector('.feedback').innerHTML = message;
}

// --------------------------------------------------------------------------------------------

// Use an IIFE to train the network asynchronously before running main.
let trainingData = [];

(async () => {
  try {
    const res = await fetch('trainingdata.json');
    trainingData = await res.json();

    console.log("Training network...");
    await net.trainAsync(trainingData, {
      iterations: 1000,
      errorThresh: 0.005,
      log: true,
      logPeriod: 100
    });
    console.log("Training complete.");

    await main();
  } catch (error) {
    console.error("Error during network training:", error);
  }
})();
