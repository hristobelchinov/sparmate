const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Global variable to store only the used keypoints from the detected pose.
let usedKeypoints = null;

async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
  return new Promise(resolve => {
    video.onloadedmetadata = () => resolve(video);
  });
}

function flipX(x) {
  return canvas.width - x;
}

function drawPoint(x, y, color = 'lime', size = 7) {
  ctx.beginPath();
  ctx.arc(x, y, size, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

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

async function main() {
  await tf.setBackend('webgl');
  await setupCamera();

  const detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    {
      modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
    }
  );

  video.play();

  async function detectPose() {
    const poses = await detector.estimatePoses(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Flip video for a mirror view.
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();

    if (poses.length > 0 && poses[0].keypoints) {
      const k = poses[0].keypoints;

      // Extract keypoints that we care about.
      const leftElbow  = k[7], rightElbow = k[8];
      const leftWrist  = k[9], rightWrist = k[10];
      const leftHip    = k[11], rightHip   = k[12];
      const leftEar    = k[3], rightEar   = k[4];

      // Calculate jaw points based on ear positions.
      const leftJaw = {
        x: leftEar.x,
        y: leftEar.y + 35,
        score: leftEar.score
      };
      const rightJaw = {
        x: rightEar.x,
        y: rightEar.y + 35,
        score: rightEar.score
      };

      // Calculate head center if both ears are reliable.
      const headCenter = (leftEar.score > 0.4 && rightEar.score > 0.4) ? {
        x: (leftEar.x + rightEar.x) / 2,
        y: Math.min(leftEar.y, rightEar.y) - 50,
        score: 1.0
      } : null;

      // Create an object that contains only the used keypoints.
      usedKeypoints = {
        leftElbow, rightElbow,
        leftWrist, rightWrist,
        leftHip, rightHip,
        leftEar, rightEar,
        leftJaw, rightJaw,
        headCenter
      };

      // (Optional) Draw these keypoints on canvas.
      [leftJaw, rightJaw, leftHip, rightHip, headCenter]
        .filter(p => p && p.score > 0.4)
        .forEach(p => drawPoint(flipX(p.x), p.y, 'blue'));
      [leftElbow, rightElbow, leftWrist, rightWrist]
        .filter(p => p && p.score > 0.4)
        .forEach(p => drawPoint(flipX(p.x), p.y, 'lime'));

      // (Optional) Draw connections between keypoints.
      const scale = getDepthScale(k);
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

// Log only the used keypoints when the button is pressed.
const logPointsButton = document.getElementById('logPointsButton');
logPointsButton.addEventListener('click', () => {
  if (usedKeypoints) {
    console.log("Used keypoints:", usedKeypoints);
  } else {
    console.log("No keypoints detected yet.");
  }
});