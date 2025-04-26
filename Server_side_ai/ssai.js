// Grab elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const net = new brain.NeuralNetwork();

let usedKeypoints = null;

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  return new Promise(resolve => {
    video.onloadedmetadata = () => resolve(video);
  });
}

// flipping the x coordinate
function flipX(x) {
  return canvas.width - x;
}

// Draw a point on the canvas
function drawPoint(x, y, color = 'lime', size = 7) {
  ctx.beginPath();
  ctx.arc(x, y, size, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

// Draw connection between two keypoints
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

// Calculate distance
function getDistance(a, b) {
  return (a?.score > 0.4 && b?.score > 0.4)
    ? Math.hypot(a.x - b.x, a.y - b.y)
    : null;
}

function getDepthScale(k) {
  const pairs = [
    getDistance(k[5], k[6]),  // shoulders
    getDistance(k[11], k[12]), // hips
    getDistance(k[7], k[8])    // elbows
  ];
  const valid = pairs.filter(v => v !== null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b) / valid.length : 200;
}

function swapKeypoints(kp, keyA, keyB) {
  const temp = kp[keyA];
  kp[keyA] = kp[keyB];
  kp[keyB] = temp;
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
    
    // mirror video
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    

    // punch form keypoints we need
    if (poses.length > 0 && poses[0].keypoints) {
      const k = poses[0].keypoints;
      const leftElbow = k[7], rightElbow = k[8];
      const leftWrist = k[9], rightWrist = k[10];
      const leftShoulder = k[5], rightShoulder = k[6];
      const leftHip = k[11], rightHip = k[12];

      // Calculate depth scale based on keypoint distance
      const depthScale = getDepthScale(k);

      // Normalize keypoints
      function normalizeKeypoint(p) {
        return {
          x: (p.x - (leftShoulder.x + rightShoulder.x) / 2) / depthScale,
          y: (p.y - (leftShoulder.y + rightShoulder.y) / 2) / depthScale,
          score: p.score
        };
      }

      const normalizedKeypoints = {};
      for (const [key, point] of Object.entries({
        leftElbow, rightElbow, leftWrist, rightWrist, leftShoulder, rightShoulder, leftHip, rightHip
      })) {
        normalizedKeypoints[key] = point ? normalizeKeypoint(point) : null;
      }

      usedKeypoints = normalizedKeypoints;

      [leftElbow, rightElbow, leftWrist, rightWrist]
        .filter(p => p && p.score > 0.4)
        .forEach(p => drawPoint(flipX(p.x), p.y, 'lime'));
      
      const scale = getDepthScale(k) || 200;
      const dLE = getDistance(leftShoulder, leftElbow);
      if (dLE !== null) drawConnection(leftShoulder, leftElbow, scale, false);
      const dRE = getDistance(rightShoulder, rightElbow);
      if (dRE !== null) drawConnection(rightShoulder, rightElbow, scale, false);
      const dLW = getDistance(leftWrist, leftElbow);
      if (dLW !== null) drawConnection(leftWrist, leftElbow, scale, false);
      const dRW = getDistance(rightWrist, rightElbow);
      if (dRW !== null) drawConnection(rightWrist, rightElbow, scale, false);
      
      const flatInput = flattenKeypoints(usedKeypoints);
      const prediction = net.run(flatInput);
      updateFeedback(prediction);
    }
    requestAnimationFrame(detectPose);
  }
  
  detectPose();
}

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

async function updateFeedback(prediction) {
  let message = "";
  let text = null;

  if(prediction.leftElbow < 0.5) { 
    message += "Left elbow too far from punch position!<br>";
    text = 1;
  } else if(prediction.rightElbow < 0.5) {
    message += "Right elbow too far from punch position!<br>";
    text = 2;
  } else if(prediction.leftWrist < 0.5) {
    message += "Left wrist in incorrect position!<br>";
    text = 3;
  } else if(prediction.rightWrist < 0.5) {
    message += "Right wrist in incorrect position!<br>";
    text = 4;
  }

  if(!message) message = "Punch form is correct!";

  document.querySelector('.feedback').innerHTML = message;


  if(text !== null) {
    const writer = port.writable.getWriter();
    const data = new Uint8Array([text]);
    await writer.write(data);
    writer.releaseLock();
    text = null;
  }
}

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
