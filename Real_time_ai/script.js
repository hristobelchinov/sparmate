// Grab elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

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
      
      // CHANGED: Calculate the hip center for normalization.
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
    }
    requestAnimationFrame(detectPose);
  }
  
  detectPose();
}

main().catch(err => {
  console.error("Error initializing pose detection:", err);
});

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

//-------------------------------------------------------------------------------------------- ai

const net = new brain.NeuralNetwork()

const data = [{"input": {
    "leftElbow_x": 511.2322235107422,
    "leftElbow_y": 479.6886444091797,
    "rightElbow_x": 174.99738693237305,
    "rightElbow_y": 469.0567016601562,
    "leftWrist_x": 430.8025360107422,
    "leftWrist_y": 463.1979751586914,
    "rightWrist_x": 192.32772827148438,
    "rightWrist_y": 456.1587524414062,
    "leftHip_x": 432.6876449584961,
    "leftHip_y": 473.95305633544916,
    "rightHip_x": 126.71439170837402,
    "rightHip_y": 489.79255676269526,
    "leftEar_x": 393.0955505371094,
    "leftEar_y": 372.8730010986328,
    "rightEar_x": 206.41138076782227,
    "rightEar_y": 377.66239166259766,
    "leftJaw_x": 393.0955505371094,
    "leftJaw_y": 407.8730010986328,
    "rightJaw_x": 206.41138076782227,
    "rightJaw_y": 412.66239166259766,
    "headCenter_x": 299.7534656524658,
    "headCenter_y": 322.8730010986328}




, "output": {
    "leftElbow":0,
    "rightElbow":0,
    "leftWrist":0,
    "rightWrist":0,
    "leftHip":0,
    "rightHip":0,
    "head":0,

}}]