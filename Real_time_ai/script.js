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
// CHANGE: Train the network asynchronously using dummy training data for testing.
const trainingData = [
    {
    "input": {
      "leftElbow_x": 0.8496081268891865,
      "leftElbow_y": -0.9935607535142847,
      "rightElbow_x": -0.8708045444404416,
      "rightElbow_y": -0.8574325966938547,
      "leftWrist_x": 1.372703545936791,
      "leftWrist_y": -1.0121590573470063,
      "rightWrist_x": -1.3114967440338086,
      "rightWrist_y": -0.6598973507863157,
      "leftHip_x": 0.2481286633308673,
      "leftHip_y": 0.0036384547612563875,
      "rightHip_x": -0.2481286633308673,
      "rightHip_y": -0.0036384547612560683,
      "leftEar_x": 0.18276176690603918,
      "leftEar_y": -1.4312534342425278,
      "rightEar_x": -0.14091925447156292,
      "rightEar_y": -1.4495510172493644,
      "leftJaw_x": 0.18276176690603918,
      "leftJaw_y": -1.2346045101715792,
      "rightJaw_x": -0.14091925447156292,
      "rightJaw_y": -1.2529020931784156,
      "headCenter_x": 0.02092125621723812,
      "headCenter_y": -1.730478051636434
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 0,
      "rightHip": 0,
      "head": 0
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.8372644739541979,
      "leftElbow_y": -0.5169238442125298,
      "rightElbow_x": -0.7470432385833893,
      "rightElbow_y": -1.3355675098577096,
      "leftWrist_x": 1.1842794566968182,
      "leftWrist_y": -0.21273319122704076,
      "rightWrist_x": -1.2548438672209088,
      "rightWrist_y": -1.653775883643872,
      "leftHip_x": 0.22942207272726955,
      "leftHip_y": 0.01564895538231067,
      "rightHip_x": -0.2294220727272699,
      "rightHip_y": -0.015648955382310342,
      "leftEar_x": 0.4751593508258516,
      "leftEar_y": -1.3088216188567647,
      "rightEar_x": 0.1816981327267916,
      "rightEar_y": -1.439044717661206,
      "leftJaw_x": 0.4751593508258516,
      "leftJaw_y": -1.1070206684410306,
      "rightJaw_x": 0.1816981327267916,
      "rightJaw_y": -1.237243767245472,
      "headCenter_x": 0.3284287417763216,
      "headCenter_y": -1.7273317896836828
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 0,
      "rightHip": 0,
      "head": 0
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.7731930043740332,
      "leftElbow_y": -1.1061804820215055,
      "rightElbow_x": -0.7424273353907304,
      "rightElbow_y": -0.634360814131302,
      "leftWrist_x": 1.3314236322488942,
      "leftWrist_y": -1.129998635674764,
      "rightWrist_x": -1.0461657106994786,
      "rightWrist_y": -0.19694137395274047,
      "leftHip_x": 0.2783063934320424,
      "leftHip_y": -0.00597085169911818,
      "rightHip_x": -0.2783063934320428,
      "rightHip_y": 0.00597085169911818,
      "leftEar_x": -0.01177437516360579,
      "leftEar_y": -1.5961007059848336,
      "rightEar_x": -0.37019657861967975,
      "rightEar_y": -1.5721794670487779,
      "leftJaw_x": -0.01177437516360579,
      "leftJaw_y": -1.3771093659793519,
      "rightJaw_x": -0.37019657861967975,
      "rightJaw_y": -1.3531881270432962,
      "headCenter_x": -0.19098547689164275,
      "headCenter_y": -1.908945477421236
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 0,
      "rightHip": 0,
      "head": 0
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.9008831959598586,
      "leftElbow_y": -0.7421266882094875,
      "rightElbow_x": -0.7228394652857112,
      "rightElbow_y": -1.3291623538858655,
      "leftWrist_x": 1.3315791028058586,
      "leftWrist_y": -0.4910220404688479,
      "rightWrist_x": -1.27233286279378,
      "rightWrist_y": -1.6231610699055197,
      "leftHip_x": 0.24356248229747068,
      "leftHip_y": 0.02926766919235761,
      "rightHip_x": -0.24356248229747104,
      "rightHip_y": -0.029267669192357258,
      "leftEar_x": 0.41352002714957115,
      "leftEar_y": -1.3476980326921153,
      "rightEar_x": 0.0914972431996973,
      "rightEar_y": -1.42815355000434,
      "leftJaw_x": 0.41352002714957115,
      "leftJaw_y": -1.1310915223005016,
      "rightJaw_x": 0.0914972431996973,
      "rightJaw_y": -1.2115470396127264,
      "headCenter_x": 0.2525086351746344,
      "headCenter_y": -1.7375914219923596
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 0,
      "rightHip": 0,
      "head": 0
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.882239046751589,
      "leftElbow_y": -1.0506109787996087,
      "rightElbow_x": -0.8686285750195525,
      "rightElbow_y": -1.043636400954234,
      "leftWrist_x": 1.4056265677321682,
      "leftWrist_y": -1.0754862685476156,
      "rightWrist_x": -1.4198409445032243,
      "rightWrist_y": -1.1601228478642784,
      "leftHip_x": 0.23779051530824918,
      "leftHip_y": 0.0029865793608767873,
      "rightHip_x": -0.23779051530824918,
      "rightHip_y": -0.0029865793608767873,
      "leftEar_x": 0.17333706387371256,
      "leftEar_y": -1.3862990667113908,
      "rightEar_x": -0.1535374944727757,
      "rightEar_y": -1.3627018748136477,
      "leftJaw_x": 0.17333706387371256,
      "leftJaw_y": -1.178095879895962,
      "rightJaw_x": -0.1535374944727757,
      "rightJaw_y": -1.1544986879982189,
      "headCenter_x": 0.009899784700468603,
      "headCenter_y": -1.683732190733432
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 0,
      "rightHip": 0,
      "head": 0
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.82096406057833,
      "leftElbow_y": -1.6514477674007235,
      "rightElbow_x": -0.6092714174127611,
      "rightElbow_y": -0.7494958584629917,
      "leftWrist_x": 1.2067366962359765,
      "leftWrist_y": -2.1316595702037233,
      "rightWrist_x": -0.7874580963509921,
      "rightWrist_y": -0.32849374834695433,
      "leftHip_x": 0.25864474710687124,
      "leftHip_y": 0.02029544635291411,
      "rightHip_x": -0.25864474710687124,
      "rightHip_y": -0.02029544635291411,
      "leftEar_x": 0.13795560272953458,
      "leftEar_y": -1.587523526655401,
      "rightEar_x": -0.20425700735720173,
      "rightEar_y": -1.5697049576408904,
      "leftJaw_x": 0.13795560272953458,
      "leftJaw_y": -1.3484796650560833,
      "rightJaw_x": -0.20425700735720173,
      "rightJaw_y": -1.3306610960415726,
      "headCenter_x": -0.03315070231383338,
      "headCenter_y": -1.9290147575115693
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 0,
      "rightHip": 0,
      "head": 0
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.7311167440860838,
      "leftElbow_y": -2.123396217388412,
      "rightElbow_x": -0.7698499729818988,
      "rightElbow_y": -2.127717459834769,
      "leftWrist_x": 0.6722923860060162,
      "leftWrist_y": -2.869026894137004,
      "rightWrist_x": -0.7280663891687839,
      "rightWrist_y": -2.8667658538924234,
      "leftHip_x": 0.33179214135590684,
      "leftHip_y": 0.00639910788221362,
      "rightHip_x": -0.3317921413559064,
      "rightHip_y": -0.006399107882214102,
      "leftEar_x": 0.19236457515937713,
      "leftEar_y": -1.95794062878524,
      "rightEar_x": -0.22203697289295574,
      "rightEar_y": -1.9633720372488266,
      "leftJaw_x": 0.19236457515937713,
      "leftJaw_y": -1.6613154584328311,
      "rightJaw_x": -0.22203697289295574,
      "rightJaw_y": -1.6667468668964178,
      "headCenter_x": -0.014836198866789298,
      "headCenter_y": -2.3871222806094106
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 0,
      "rightHip": 0,
      "head": 0
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.7512018470895909,
      "leftElbow_y": -0.6628036528519254,
      "rightElbow_x": -0.7040973719918411,
      "rightElbow_y": -0.6398665484536887,
      "leftWrist_x": 0.9401877581550551,
      "leftWrist_y": -0.039755341229349705,
      "rightWrist_x": -0.9375498709649649,
      "rightWrist_y": -0.1108646403458169,
      "leftHip_x": 0.30070433153972576,
      "leftHip_y": 0.012034511771671606,
      "rightHip_x": -0.30070433153972576,
      "rightHip_y": -0.012034511771671606,
      "leftEar_x": 0.2000171591374137,
      "leftEar_y": -1.6953071462942193,
      "rightEar_x": -0.18574861241275561,
      "rightEar_y": -1.670587088814238,
      "leftJaw_x": 0.2000171591374137,
      "leftJaw_y": -1.4367839825312834,
      "rightJaw_x": -0.18574861241275561,
      "rightJaw_y": -1.4120639250513023,
      "headCenter_x": 0.0071342733623292395,
      "headCenter_y": -2.0646259516698415
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 0,
      "rightHip": 0,
      "head": 0
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.6102014278419478,
      "leftElbow_y": -0.7888589946434569,
      "rightElbow_x": -0.5481657594616389,
      "rightElbow_y": -0.8414654531141055,
      "leftWrist_x": 0.30022372855476903,
      "leftWrist_y": -1.5809052270100257,
      "rightWrist_x": -0.2376500735542139,
      "rightWrist_y": -1.5432832303034738,
      "leftHip_x": 0.3643880147929813,
      "leftHip_y": 0.032955391570361516,
      "rightHip_x": -0.3643880147929808,
      "rightHip_y": -0.032955391570361516,
      "leftEar_x": 0.24706419287181838,
      "leftEar_y": -2.1111364186290467,
      "rightEar_x": -0.25553974709540067,
      "rightEar_y": -2.0934172602231516,
      "leftJaw_x": 0.24706419287181838,
      "leftJaw_y": -1.8063289927352049,
      "rightJaw_x": -0.25553974709540067,
      "rightJaw_y": -1.7886098343293095,
      "headCenter_x": -0.004237777111791389,
      "headCenter_y": -2.5465755984773923
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.7331048186998869,
      "leftElbow_y": -0.8520891635855748,
      "rightElbow_x": -0.5656318591226793,
      "rightElbow_y": -0.8700929064599203,
      "leftWrist_x": 0.41207214525139063,
      "leftWrist_y": -1.563559733745749,
      "rightWrist_x": -0.2513473140437926,
      "rightWrist_y": -1.5652331919774933,
      "leftHip_x": 0.34402731079963056,
      "leftHip_y": 0.016547429025186945,
      "rightHip_x": -0.34402731079963056,
      "rightHip_y": -0.016547429025186945,
      "leftEar_x": 0.30453469185827114,
      "leftEar_y": -2.0129563952092444,
      "rightEar_x": -0.17361687154468136,
      "rightEar_y": -2.017997796176358,
      "leftJaw_x": 0.30453469185827114,
      "leftJaw_y": -1.7199402340553196,
      "rightJaw_x": -0.17361687154468136,
      "rightJaw_y": -1.7249816350224332,
      "headCenter_x": 0.06545891015679489,
      "headCenter_y": -2.436592312110536
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.5627069076836269,
      "leftElbow_y": -0.8636753939133689,
      "rightElbow_x": -0.6014963619048111,
      "rightElbow_y": -0.8602327587228936,
      "leftWrist_x": 0.2487808402959293,
      "leftWrist_y": -1.6719507687539408,
      "rightWrist_x": -0.3003427116044736,
      "rightWrist_y": -1.583130164680786,
      "leftHip_x": 0.36201851066403584,
      "leftHip_y": 0.024183750373500804,
      "rightHip_x": -0.36201851066403584,
      "rightHip_y": -0.024183750373500804,
      "leftEar_x": 0.1986819138445895,
      "leftEar_y": -2.200111054047383,
      "rightEar_x": -0.27885961193013964,
      "rightEar_y": -2.200908285247911,
      "leftJaw_x": 0.1986819138445895,
      "leftJaw_y": -1.8951924952258592,
      "rightJaw_x": -0.27885961193013964,
      "rightJaw_y": -1.8959897264263872,
      "headCenter_x": -0.04008884904277508,
      "headCenter_y": -2.6365062264215173
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.9986257197762449,
      "leftElbow_y": -1.1808103794378928,
      "rightElbow_x": -0.5085600675005615,
      "rightElbow_y": -0.6509549688943861,
      "leftWrist_x": 0.28582195136784544,
      "leftWrist_y": -1.3821054932272978,
      "rightWrist_x": -0.21428484565307002,
      "rightWrist_y": -1.1907650534802734,
      "leftHip_x": 0.27169309068982245,
      "leftHip_y": 0.017424039780536072,
      "rightHip_x": -0.2716930906898221,
      "rightHip_y": -0.01742403978053644,
      "leftEar_x": 0.19126119776225692,
      "leftEar_y": -1.591385793611311,
      "rightEar_x": -0.17669858940487357,
      "rightEar_y": -1.5724707269779596,
      "leftJaw_x": 0.19126119776225692,
      "leftJaw_y": -1.3645648829255204,
      "rightJaw_x": -0.17669858940487357,
      "rightJaw_y": -1.345649816292169,
      "headCenter_x": 0.007281304178691852,
      "headCenter_y": -1.9154156660195834
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.8973590823531836,
      "leftElbow_y": -0.9316199631885245,
      "rightElbow_x": -0.5425356621477329,
      "rightElbow_y": -0.6950991236101056,
      "leftWrist_x": 0.3096536306368398,
      "leftWrist_y": -1.4177768048646144,
      "rightWrist_x": -0.2470042562712734,
      "rightWrist_y": -1.2850826933591115,
      "leftHip_x": 0.3040925571365933,
      "leftHip_y": 0.019235985867357207,
      "rightHip_x": -0.3040925571365933,
      "rightHip_y": -0.019235985867357207,
      "leftEar_x": 0.206030858701319,
      "leftEar_y": -1.7518887857757905,
      "rightEar_x": -0.20534929411145103,
      "rightEar_y": -1.7406898701790594,
      "leftJaw_x": 0.206030858701319,
      "leftJaw_y": -1.5037727539996963,
      "rightJaw_x": -0.20534929411145103,
      "rightJaw_y": -1.4925738384029652,
      "headCenter_x": 0.00034078229493417943,
      "headCenter_y": -2.106340259741639
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.8741547940902262,
      "leftElbow_y": -1.6767949300348732,
      "rightElbow_x": -0.4670586490887891,
      "rightElbow_y": -0.5810858126402881,
      "leftWrist_x": 0.23822749378552302,
      "leftWrist_y": -1.494791482313667,
      "rightWrist_x": -0.2647956961516153,
      "rightWrist_y": -1.1574652972159991,
      "leftHip_x": 0.26670834185183234,
      "leftHip_y": 0.012407042782120164,
      "rightHip_x": -0.26670834185183234,
      "rightHip_y": -0.012407042782120164,
      "leftEar_x": 0.10878119143510892,
      "leftEar_y": -1.5221437924698704,
      "rightEar_x": -0.24536680937923633,
      "rightEar_y": -1.5215793157036652,
      "leftJaw_x": 0.10878119143510892,
      "leftJaw_y": -1.302582841022207,
      "rightJaw_x": -0.24536680937923633,
      "rightJaw_y": -1.3020183642560017,
      "headCenter_x": -0.06829280897206352,
      "headCenter_y": -1.8358022945379613
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.5880490503371595,
      "leftElbow_y": -0.7394282069020885,
      "rightElbow_x": -0.6898255989431078,
      "rightElbow_y": -0.8087495347991775,
      "leftWrist_x": 0.7720810267731352,
      "leftWrist_y": -1.4751015977672564,
      "rightWrist_x": -0.3506417990729076,
      "rightWrist_y": -1.425146329355223,
      "leftHip_x": 0.3323131530436286,
      "leftHip_y": 0.00737514736850393,
      "rightHip_x": -0.33231315304362813,
      "rightHip_y": -0.007375147368504398,
      "leftEar_x": 0.20226742291854283,
      "leftEar_y": -2.013022615801027,
      "rightEar_x": -0.258160193978224,
      "rightEar_y": -2.024945915528632,
      "leftJaw_x": 0.20226742291854283,
      "leftJaw_y": -1.7241063001957098,
      "rightJaw_x": -0.258160193978224,
      "rightJaw_y": -1.7360295999233148,
      "headCenter_x": -0.027946385529840582,
      "headCenter_y": -2.4376835092505136
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 0,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.6531228732288656,
      "leftElbow_y": -0.8185510709560327,
      "rightElbow_x": -0.6682007821005305,
      "rightElbow_y": -0.7606370560971576,
      "leftWrist_x": 0.5655892929679791,
      "leftWrist_y": -1.58397902536217,
      "rightWrist_x": -0.3439129176509128,
      "rightWrist_y": -1.3653064664815513,
      "leftHip_x": 0.3292887430394014,
      "leftHip_y": 0.001925777963097425,
      "rightHip_x": -0.3292887430394009,
      "rightHip_y": -0.001925777963097425,
      "leftEar_x": 0.17742119796847958,
      "leftEar_y": -1.972268369506023,
      "rightEar_x": -0.255884067927543,
      "rightEar_y": -1.9837223445598124,
      "leftJaw_x": 0.17742119796847958,
      "leftJaw_y": -1.6837151694449917,
      "rightJaw_x": -0.255884067927543,
      "rightJaw_y": -1.695169144498781,
      "headCenter_x": -0.0392314349795317,
      "headCenter_y": -2.3959412017898574
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 0,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.6211952324893892,
      "leftElbow_y": -0.7856294978783187,
      "rightElbow_x": -0.6623929631549418,
      "rightElbow_y": -0.8738724517106513,
      "leftWrist_x": 0.007044310662397869,
      "leftWrist_y": -0.3966400377990665,
      "rightWrist_x": -0.3644846281953702,
      "rightWrist_y": -1.524896319583123,
      "leftHip_x": 0.34009637575953194,
      "leftHip_y": 0.003076817086887399,
      "rightHip_x": -0.34009637575953194,
      "rightHip_y": -0.003076817086887399,
      "leftEar_x": 0.1710827657246264,
      "leftEar_y": -2.0421032945071436,
      "rightEar_x": -0.2716549752306364,
      "rightEar_y": -2.0253827347257416,
      "leftJaw_x": 0.1710827657246264,
      "leftJaw_y": -1.7509087582323988,
      "rightJaw_x": -0.2716549752306364,
      "rightJaw_y": -1.7341881984509966,
      "headCenter_x": -0.05028610475300502,
      "headCenter_y": -2.4580954891853506
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 0,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.6185691762353357,
      "leftElbow_y": -0.7831191461014162,
      "rightElbow_x": -0.7155456425178724,
      "rightElbow_y": -0.8929124409897577,
      "leftWrist_x": -0.1964528914974404,
      "leftWrist_y": -1.0017623320589828,
      "rightWrist_x": -0.39549069413650945,
      "rightWrist_y": -1.5054165831348623,
      "leftHip_x": 0.3387248545991887,
      "leftHip_y": 0.017266191229689046,
      "rightHip_x": -0.33872485459918916,
      "rightHip_y": -0.017266191229689046,
      "leftEar_x": 0.18791881083688616,
      "leftEar_y": -2.031667795676313,
      "rightEar_x": -0.25646061125174563,
      "rightEar_y": -2.0305781878912432,
      "leftJaw_x": 0.18791881083688616,
      "leftJaw_y": -1.7379953756951885,
      "rightJaw_x": -0.25646061125174563,
      "rightJaw_y": -1.736905767910119,
      "headCenter_x": -0.0342709002074295,
      "headCenter_y": -2.451199824220776
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 0,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.6687123836064343,
      "leftElbow_y": -0.7554660089897274,
      "rightElbow_x": -0.6518702163345155,
      "rightElbow_y": -0.8183273353390081,
      "leftWrist_x": 0.7802001086991114,
      "leftWrist_y": -1.4595023043423103,
      "rightWrist_x": -0.32981229657650185,
      "rightWrist_y": -1.435477262068152,
      "leftHip_x": 0.3376754220134827,
      "leftHip_y": -0.007076019301928586,
      "rightHip_x": -0.3376754220134827,
      "rightHip_y": 0.007076019301928586,
      "leftEar_x": 0.2114232340330464,
      "leftEar_y": -1.9175394251312792,
      "rightEar_x": -0.2305864894773283,
      "rightEar_y": -1.9012229778874616,
      "leftJaw_x": 0.2114232340330464,
      "leftJaw_y": -1.6468945465415576,
      "rightJaw_x": -0.2305864894773283,
      "rightJaw_y": -1.6305780992977401,
      "headCenter_x": -0.009581627722140955,
      "headCenter_y": -2.304174965973739
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 0,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.7406618830158803,
      "leftElbow_y": -1.5290976830804823,
      "rightElbow_x": -0.5744267683916591,
      "rightElbow_y": -0.5989907487944344,
      "leftWrist_x": 1.1010968980614737,
      "leftWrist_y": -2.1613132093707397,
      "rightWrist_x": -0.37515278107996486,
      "rightWrist_y": -1.2476815167401936,
      "leftHip_x": 0.28892355912101464,
      "leftHip_y": -0.027931223989854214,
      "rightHip_x": -0.28892355912101464,
      "rightHip_y": 0.027931223989853825,
      "leftEar_x": 0.018029213496213444,
      "leftEar_y": -1.6106386539230781,
      "rightEar_x": -0.3381567846463791,
      "rightEar_y": -1.5913492681225936,
      "leftJaw_x": 0.018029213496213444,
      "leftJaw_y": -1.3715363736812716,
      "rightJaw_x": -0.3381567846463791,
      "rightJaw_y": -1.3522469878807868,
      "headCenter_x": -0.16006378557508302,
      "headCenter_y": -1.9522133399828019
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 1,
      "leftWrist": 0,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.898805148748825,
      "leftElbow_y": -1.1617505940560575,
      "rightElbow_x": -0.5892132514355262,
      "rightElbow_y": -0.6716565442092461,
      "leftWrist_x": 1.5243079063822442,
      "leftWrist_y": -0.9871707840048582,
      "rightWrist_x": -0.3627016642524509,
      "rightWrist_y": -1.3108701249854795,
      "leftHip_x": 0.29671468111973337,
      "leftHip_y": -0.021988799424489103,
      "rightHip_x": -0.29671468111973337,
      "rightHip_y": 0.021988799424488704,
      "leftEar_x": 0.03871905294662546,
      "leftEar_y": -1.7158952196153419,
      "rightEar_x": -0.3304452461618408,
      "rightEar_y": -1.673717990749594,
      "leftJaw_x": 0.03871905294662546,
      "leftJaw_y": -1.4698219231892486,
      "rightJaw_x": -0.3304452461618408,
      "rightJaw_y": -1.427644694323501,
      "headCenter_x": -0.14586309660760746,
      "headCenter_y": -2.0674285002240462
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 1,
      "leftWrist": 0,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.7932200717481921,
      "leftElbow_y": -0.8252569222919295,
      "rightElbow_x": -0.6166979305334176,
      "rightElbow_y": -0.7505381644399334,
      "leftWrist_x": 1.1442087252724158,
      "leftWrist_y": -0.3642997077143919,
      "rightWrist_x": -0.35192038780254037,
      "rightWrist_y": -1.404208341973379,
      "leftHip_x": 0.30920207628286556,
      "leftHip_y": -0.002959734420300969,
      "rightHip_x": -0.30920207628286556,
      "rightHip_y": 0.0029597344203014047,
      "leftEar_x": 0.14095739697720608,
      "leftEar_y": -1.8665574422342317,
      "rightEar_x": -0.27252660736942336,
      "rightEar_y": -1.840084887576218,
      "leftJaw_x": 0.14095739697720608,
      "leftJaw_y": -1.5979651617184296,
      "rightJaw_x": -0.27252660736942336,
      "rightJaw_y": -1.5714926070604158,
      "headCenter_x": -0.06578460519610865,
      "headCenter_y": -2.250260700113949
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 1,
      "leftWrist": 0,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": -0.5663294541379632,
      "leftElbow_y": -1.4178477430976288,
      "rightElbow_x": -1.2015626251361287,
      "rightElbow_y": -1.7622806230846129,
      "leftWrist_x": -0.5396143237615396,
      "leftWrist_y": -2.9526387975416526,
      "rightWrist_x": -0.7613231289162893,
      "rightWrist_y": -2.8620077612672206,
      "leftHip_x": 0.4903696155497455,
      "leftHip_y": 0.043029869636348875,
      "rightHip_x": -0.4903696155497455,
      "rightHip_y": -0.04302986963634977,
      "leftEar_x": 0.35163849645540307,
      "leftEar_y": -3.6794537073099485,
      "rightEar_x": -0.5061932435741296,
      "rightEar_y": -3.6858435567963466,
      "leftJaw_x": 0.35163849645540307,
      "leftJaw_y": -3.1286022121329666,
      "rightJaw_x": -0.5061932435741296,
      "rightJaw_y": -3.1349920616193647,
      "headCenter_x": -0.07727737355936326,
      "headCenter_y": -4.472774264192035
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 1,
      "leftWrist": 0,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.499165160019786,
      "leftElbow_y": -0.7005572030335714,
      "rightElbow_x": -0.9427827096636903,
      "rightElbow_y": -1.134180022195497,
      "leftWrist_x": 0.171349079646398,
      "leftWrist_y": -1.2922970736617085,
      "rightWrist_x": -0.37235720143650763,
      "rightWrist_y": -1.3671814624825809,
      "leftHip_x": 0.30241144783381996,
      "leftHip_y": -0.010557058930157591,
      "rightHip_x": -0.3024114478338196,
      "rightHip_y": 0.01055705893015722,
      "leftEar_x": 0.14491597479558205,
      "leftEar_y": -1.6281089323385791,
      "rightEar_x": -0.25754505201590927,
      "rightEar_y": -1.629072864416985,
      "leftJaw_x": 0.14491597479558205,
      "leftJaw_y": -1.400232153981962,
      "rightJaw_x": -0.25754505201590927,
      "rightJaw_y": -1.4011960860603683,
      "headCenter_x": -0.05631453861016379,
      "headCenter_y": -1.9546111192121518
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.5650216444041899,
      "leftElbow_y": -0.7551713720658497,
      "rightElbow_x": -0.7208372672457499,
      "rightElbow_y": -0.7398692125808224,
      "leftWrist_x": 0.17594329856362403,
      "leftWrist_y": -1.4438880157898173,
      "rightWrist_x": -0.38820527145428935,
      "rightWrist_y": -1.400911197510803,
      "leftHip_x": 0.3421487707285152,
      "leftHip_y": -0.003954924132333498,
      "rightHip_x": -0.34214877072851474,
      "rightHip_y": 0.0039549241323330615,
      "leftEar_x": 0.1404021755497778,
      "leftEar_y": -1.9091151844203158,
      "rightEar_x": -0.34374303331333295,
      "rightEar_y": -1.8777300784362962,
      "leftJaw_x": 0.1404021755497778,
      "leftJaw_y": -1.6401633585948232,
      "rightJaw_x": -0.34374303331333295,
      "rightJaw_y": -1.6087782526108039,
      "headCenter_x": -0.10167042888177777,
      "headCenter_y": -2.2933320784567335
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.4917690846426463,
      "leftElbow_y": -0.6370524064600315,
      "rightElbow_x": -0.8497362369235332,
      "rightElbow_y": -1.520837963564871,
      "leftWrist_x": 0.18306240752142117,
      "leftWrist_y": -1.2449140847696258,
      "rightWrist_x": -0.40630529271194565,
      "rightWrist_y": -1.4260017250607913,
      "leftHip_x": 0.28324734117510175,
      "leftHip_y": 0.008643694647606953,
      "rightHip_x": -0.2832473411751014,
      "rightHip_y": -0.008643694647607301,
      "leftEar_x": 0.14444492295494052,
      "leftEar_y": -1.520058282528741,
      "rightEar_x": -0.2348828000827991,
      "rightEar_y": -1.492962467453855,
      "leftJaw_x": 0.14444492295494052,
      "leftJaw_y": -1.305343746478819,
      "rightJaw_x": -0.2348828000827991,
      "rightJaw_y": -1.2782479314039332,
      "headCenter_x": -0.04521893856392929,
      "headCenter_y": -1.8267933340286295
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.555946817423215,
      "leftElbow_y": -0.6716768232704537,
      "rightElbow_x": -0.8488851333020454,
      "rightElbow_y": -1.115100515299446,
      "leftWrist_x": 0.2673702692276079,
      "leftWrist_y": -1.3357854336672397,
      "rightWrist_x": -0.3484606548040529,
      "rightWrist_y": -1.3540904850161584,
      "leftHip_x": 0.30262633863316013,
      "leftHip_y": 0.0038275847699555296,
      "rightHip_x": -0.30262633863316013,
      "rightHip_y": -0.003827584769955911,
      "leftEar_x": 0.21596275118905467,
      "leftEar_y": -1.664056293211457,
      "rightEar_x": -0.19040205373231228,
      "rightEar_y": -1.645735002827166,
      "leftJaw_x": 0.21596275118905467,
      "leftJaw_y": -1.429323910003344,
      "rightJaw_x": -0.19040205373231228,
      "rightJaw_y": -1.411002619619053,
      "headCenter_x": 0.012780348728371386,
      "headCenter_y": -1.999388269223047
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.7675501934779786,
      "leftElbow_y": -0.8975115802713279,
      "rightElbow_x": -0.277518840644359,
      "rightElbow_y": -0.7919094132509356,
      "leftWrist_x": 0.319729042983652,
      "leftWrist_y": -1.6975052236349266,
      "rightWrist_x": -0.34418858449730466,
      "rightWrist_y": -1.6702702820130968,
      "leftHip_x": 0.38411512303751305,
      "leftHip_y": 0.0028070012947579125,
      "rightHip_x": -0.38411512303751255,
      "rightHip_y": -0.002807001294757419,
      "leftEar_x": 0.23274380690835905,
      "leftEar_y": -2.1606301135443973,
      "rightEar_x": -0.32234829359266365,
      "rightEar_y": -2.094531449243183,
      "leftJaw_x": 0.23274380690835905,
      "leftJaw_y": -1.8567745287082937,
      "rightJaw_x": -0.32234829359266365,
      "rightJaw_y": -1.7906758644070795,
      "headCenter_x": -0.04480224334215205,
      "headCenter_y": -2.5947095204531165
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.6259588685173819,
      "leftElbow_y": -0.7459389483789681,
      "rightElbow_x": -0.7347822227238698,
      "rightElbow_y": -0.7760859061783141,
      "leftWrist_x": 0.27106540156158065,
      "leftWrist_y": -1.4446815068098302,
      "rightWrist_x": -0.4160229192519809,
      "rightWrist_y": -1.4147306719743158,
      "leftHip_x": 0.32814369743687494,
      "leftHip_y": -0.014020281348032721,
      "rightHip_x": -0.32814369743687494,
      "rightHip_y": 0.014020281348032721,
      "leftEar_x": 0.18522138136228544,
      "leftEar_y": -1.815164309983689,
      "rightEar_x": -0.2716707032475312,
      "rightEar_y": -1.7988121206796823,
      "leftJaw_x": 0.18522138136228544,
      "leftJaw_y": -1.552975045115281,
      "rightJaw_x": -0.2716707032475312,
      "rightJaw_y": -1.5366228558112744,
      "headCenter_x": -0.04322466094262287,
      "headCenter_y": -2.189720402652843
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 1,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.6196051351914775,
      "leftElbow_y": -0.7845038033829044,
      "rightElbow_x": -0.5831143584615239,
      "rightElbow_y": -0.6942574398042746,
      "leftWrist_x": 0.22070900159340856,
      "leftWrist_y": -1.478521590655447,
      "rightWrist_x": -1.0265760860975106,
      "rightWrist_y": -1.1892860989601755,
      "leftHip_x": 0.34367017163084834,
      "leftHip_y": 0.006347986248333464,
      "rightHip_x": -0.34367017163084834,
      "rightHip_y": -0.006347986248333923,
      "leftEar_x": 0.21455657405194276,
      "leftEar_y": -2.017879064923589,
      "rightEar_x": -0.2508253849305523,
      "rightEar_y": -1.970433049479633,
      "leftJaw_x": 0.21455657405194276,
      "leftJaw_y": -1.7351032146429684,
      "rightJaw_x": -0.2508253849305523,
      "rightJaw_y": -1.6876571991990121,
      "headCenter_x": -0.01813440543930454,
      "headCenter_y": -2.421844565324476
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.5901499110900562,
      "leftElbow_y": -0.753917684675147,
      "rightElbow_x": -0.6097383227958352,
      "rightElbow_y": -0.6950706262216415,
      "leftWrist_x": 0.2606897935478925,
      "leftWrist_y": -1.4130536012822132,
      "rightWrist_x": -0.7367342009182172,
      "rightWrist_y": -1.3417570998013986,
      "leftHip_x": 0.34839629914697645,
      "leftHip_y": -0.004684597252474177,
      "rightHip_x": -0.3483962991469769,
      "rightHip_y": 0.004684597252473741,
      "leftEar_x": 0.19246861577825647,
      "leftEar_y": -1.9254838618009475,
      "rightEar_x": -0.26914489612923814,
      "rightEar_y": -1.8876491536278552,
      "leftJaw_x": 0.19246861577825647,
      "leftJaw_y": -1.6570682071355818,
      "rightJaw_x": -0.26914489612923814,
      "rightJaw_y": -1.6192334989624897,
      "headCenter_x": -0.03833814017549106,
      "headCenter_y": -2.3089347970371845
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.6257927526864928,
      "leftElbow_y": -0.7728960822458908,
      "rightElbow_x": -0.6403612818429817,
      "rightElbow_y": -0.8715975921101938,
      "leftWrist_x": 0.2952803511441349,
      "leftWrist_y": -1.4663370642681852,
      "rightWrist_x": -1.2878845113036044,
      "rightWrist_y": -0.6516765637150073,
      "leftHip_x": 0.35132796356985585,
      "leftHip_y": 0.005293190415628644,
      "rightHip_x": -0.3513279635698554,
      "rightHip_y": -0.005293190415628644,
      "leftEar_x": 0.2803140777408261,
      "leftEar_y": -1.9912600661393047,
      "rightEar_x": -0.16889368248780615,
      "rightEar_y": -1.9590831322055113,
      "leftJaw_x": 0.2803140777408261,
      "leftJaw_y": -1.7228613487761657,
      "rightJaw_x": -0.16889368248780615,
      "rightJaw_y": -1.690684414842372,
      "headCenter_x": 0.05571019762650997,
      "headCenter_y": -2.3746868052295036
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.6114929036109872,
      "leftElbow_y": -0.7507411451046606,
      "rightElbow_x": -0.6557369390265783,
      "rightElbow_y": -0.8079367434645488,
      "leftWrist_x": 0.29059600388215945,
      "leftWrist_y": -1.4562353473271745,
      "rightWrist_x": -1.1495740228196758,
      "rightWrist_y": -0.3099200567805472,
      "leftHip_x": 0.33945950076070613,
      "leftHip_y": 0.006609863776859626,
      "rightHip_x": -0.3394595007607066,
      "rightHip_y": -0.006609863776860065,
      "leftEar_x": 0.2732674903039291,
      "leftEar_y": -1.9766605071315502,
      "rightEar_x": -0.18299307052048916,
      "rightEar_y": -1.9309849302135174,
      "leftJaw_x": 0.2732674903039291,
      "leftJaw_y": -1.7063530977254937,
      "rightJaw_x": -0.18299307052048916,
      "rightJaw_y": -1.660677520807461,
      "headCenter_x": 0.04513720989171997,
      "headCenter_y": -2.3628139491402025
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.600017753196144,
      "leftElbow_y": -0.7321576072401188,
      "rightElbow_x": -0.6954211324606513,
      "rightElbow_y": -0.8819418429265583,
      "leftWrist_x": 0.29360488825068104,
      "leftWrist_y": -1.4222355586976791,
      "rightWrist_x": -0.8970014602224441,
      "rightWrist_y": -1.517561988676425,
      "leftHip_x": 0.33666226317791964,
      "leftHip_y": -0.001546926912896278,
      "rightHip_x": -0.33666226317792003,
      "rightHip_y": 0.001546926912896278,
      "leftEar_x": 0.2649525655782104,
      "leftEar_y": -1.9292976367310477,
      "rightEar_x": -0.17226598742431085,
      "rightEar_y": -1.8977175580795544,
      "leftJaw_x": 0.2649525655782104,
      "leftJaw_y": -1.6648336511940447,
      "rightJaw_x": -0.17226598742431085,
      "rightJaw_y": -1.6332535725425514,
      "headCenter_x": 0.04634328907694978,
      "headCenter_y": -2.3071033303553374
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 1,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.5221109980542479,
      "leftElbow_y": -0.8100257999770594,
      "rightElbow_x": -0.9727648193398094,
      "rightElbow_y": -1.055446675079303,
      "leftWrist_x": 0.1848499196784511,
      "leftWrist_y": -1.4117345599040145,
      "rightWrist_x": -1.3562277392741138,
      "rightWrist_y": -0.7043467140051669,
      "leftHip_x": 0.2833985609007816,
      "leftHip_y": -0.004264411629668925,
      "rightHip_x": -0.283398560900782,
      "rightHip_y": 0.00426441162966936,
      "leftEar_x": 0.15194184404950478,
      "leftEar_y": -1.7379413273865494,
      "rightEar_x": -0.24665456805342142,
      "rightEar_y": -1.745949110525496,
      "leftJaw_x": 0.15194184404950478,
      "leftJaw_y": -1.4697743910484944,
      "rightJaw_x": -0.24665456805342142,
      "rightJaw_y": -1.477782174187441,
      "headCenter_x": -0.047356362001958315,
      "headCenter_y": -2.129044733865575
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.5978177800720936,
      "leftElbow_y": -0.9060215863229573,
      "rightElbow_x": -0.738878867876539,
      "rightElbow_y": -0.8246131784415702,
      "leftWrist_x": 0.21614970651642093,
      "leftWrist_y": -1.573712854975109,
      "rightWrist_x": -1.0311297722805786,
      "rightWrist_y": -0.3036472821447177,
      "leftHip_x": 0.3217982718415672,
      "leftHip_y": -0.011003278665369775,
      "rightHip_x": -0.3217982718415672,
      "rightHip_y": 0.011003278665370271,
      "leftEar_x": 0.16117424853230952,
      "leftEar_y": -1.9393751129684296,
      "rightEar_x": -0.2891404447844499,
      "rightEar_y": -1.9567899359980407,
      "leftJaw_x": 0.16117424853230952,
      "leftJaw_y": -1.6336863077315067,
      "rightJaw_x": -0.2891404447844499,
      "rightJaw_y": -1.6511011307611179,
      "headCenter_x": -0.06398309812607042,
      "headCenter_y": -2.3934882291936446
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.5008076968225278,
      "leftElbow_y": -0.7583327001694049,
      "rightElbow_x": -0.8281913674528204,
      "rightElbow_y": -1.6716571599267327,
      "leftWrist_x": 0.23003642898587665,
      "leftWrist_y": -1.3432383558924446,
      "rightWrist_x": -1.2005863778557997,
      "rightWrist_y": -2.125485812529893,
      "leftHip_x": 0.27119015502029375,
      "leftHip_y": 0.014457089100731103,
      "rightHip_x": -0.27119015502029414,
      "rightHip_y": -0.014457089100731516,
      "leftEar_x": 0.1598243714850813,
      "leftEar_y": -1.6364702548520296,
      "rightEar_x": -0.21602261613826906,
      "rightEar_y": -1.6373224250057918,
      "leftJaw_x": 0.1598243714850813,
      "leftJaw_y": -1.382550967695013,
      "rightJaw_x": -0.21602261613826906,
      "rightJaw_y": -1.383403137848775,
      "headCenter_x": -0.028099122326593878,
      "headCenter_y": -2.00006426380153
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.5402471810748868,
      "leftElbow_y": -0.7532939950943754,
      "rightElbow_x": -0.5324114200888922,
      "rightElbow_y": -1.9051963404040835,
      "leftWrist_x": 0.25951181451326466,
      "leftWrist_y": -1.4172473823571674,
      "rightWrist_x": -0.39721432078903224,
      "rightWrist_y": -2.5260238685054257,
      "leftHip_x": 0.29959467319265703,
      "leftHip_y": 0.018223820026585884,
      "rightHip_x": -0.2995946731926566,
      "rightHip_y": -0.018223820026585884,
      "leftEar_x": 0.22376832088758727,
      "leftEar_y": -1.769035547925335,
      "rightEar_x": -0.1943788394544966,
      "rightEar_y": -1.7611620281714415,
      "leftJaw_x": 0.22376832088758727,
      "leftJaw_y": -1.4903811137862257,
      "rightJaw_x": -0.1943788394544966,
      "rightJaw_y": -1.4825075940323325,
      "headCenter_x": 0.014694740716545338,
      "headCenter_y": -2.1671133109812053
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.7644497145454182,
      "leftElbow_y": -0.9838400314764612,
      "rightElbow_x": -0.39269010589900516,
      "rightElbow_y": -0.9022810631083767,
      "leftWrist_x": 0.39443975582519797,
      "leftWrist_y": -1.7233144606664443,
      "rightWrist_x": 0.13996412996176763,
      "rightWrist_y": -0.3171236810408394,
      "leftHip_x": 0.36815017709025594,
      "leftHip_y": -0.014486880476992745,
      "rightHip_x": -0.3681501770902554,
      "rightHip_y": 0.014486880476993319,
      "leftEar_x": 0.29427882511029024,
      "leftEar_y": -2.162095615101005,
      "rightEar_x": -0.2412005375792658,
      "rightEar_y": -2.145055795084479,
      "leftJaw_x": 0.29427882511029024,
      "leftJaw_y": -1.8083360776461794,
      "rightJaw_x": -0.2412005375792658,
      "rightJaw_y": -1.7912962576296532,
      "headCenter_x": 0.026539143765512235,
      "headCenter_y": -2.667466382893613
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.4925102413519935,
      "leftElbow_y": -0.8631283120144501,
      "rightElbow_x": -1.0530549205248365,
      "rightElbow_y": -1.1025918677610025,
      "leftWrist_x": 0.16569918869713798,
      "leftWrist_y": -1.441322055304291,
      "rightWrist_x": -1.6564438131762782,
      "rightWrist_y": -0.9182082582671446,
      "leftHip_x": 0.27679439383247256,
      "leftHip_y": 0.004190235865877044,
      "rightHip_x": -0.27679439383247256,
      "rightHip_y": -0.004190235865877482,
      "leftEar_x": 0.09746458926898402,
      "leftEar_y": -1.7433430598160014,
      "rightEar_x": -0.30662383938669513,
      "rightEar_y": -1.7333068994897098,
      "leftJaw_x": 0.09746458926898402,
      "leftJaw_y": -1.4735684357274705,
      "rightJaw_x": -0.30662383938669513,
      "rightJaw_y": -1.4635322754011793,
      "headCenter_x": -0.10457962505885555,
      "headCenter_y": -2.1287353799424737
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.5553819792699197,
      "leftElbow_y": -0.7869181203904667,
      "rightElbow_x": -0.8602458323218524,
      "rightElbow_y": -1.6148846098793603,
      "leftWrist_x": 0.2824570135275028,
      "leftWrist_y": -1.399749444841893,
      "rightWrist_x": -1.2021837807031803,
      "rightWrist_y": -2.087782659038147,
      "leftHip_x": 0.2720233027524701,
      "leftHip_y": 0.007667329011136791,
      "rightHip_x": -0.2720233027524701,
      "rightHip_y": -0.007667329011136791,
      "leftEar_x": 0.22873877069945622,
      "leftEar_y": -1.6903007646979527,
      "rightEar_x": -0.15146049572702472,
      "rightEar_y": -1.6866768723390886,
      "leftJaw_x": 0.22873877069945622,
      "leftJaw_y": -1.4298137251370573,
      "rightJaw_x": -0.15146049572702472,
      "rightJaw_y": -1.4261898327781932,
      "headCenter_x": 0.03863913748621554,
      "headCenter_y": -2.0624251069278032
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.5658988319428687,
      "leftElbow_y": -0.7596556559698163,
      "rightElbow_x": -0.9165839040699327,
      "rightElbow_y": -1.4740514922001542,
      "leftWrist_x": 0.2694358040799555,
      "leftWrist_y": -1.3816934934577607,
      "rightWrist_x": -0.897190927396862,
      "rightWrist_y": -1.055167109834518,
      "leftHip_x": 0.2617390129492555,
      "leftHip_y": 0.006561010037174816,
      "rightHip_x": -0.26173901294925594,
      "rightHip_y": -0.006561010037174816,
      "leftEar_x": 0.22314962353288348,
      "leftEar_y": -1.666122578144552,
      "rightEar_x": -0.18162867730452917,
      "rightEar_y": -1.6983785023431759,
      "leftJaw_x": 0.22314962353288348,
      "leftJaw_y": -1.4029071997108888,
      "rightJaw_x": -0.18162867730452917,
      "rightJaw_y": -1.4351631239095126,
      "headCenter_x": 0.020760473114177166,
      "headCenter_y": -2.074400471534123
    },
    "output": {
      "leftElbow": 1,
      "rightElbow": 0,
      "leftWrist": 1,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.739266470209609,
      "leftElbow_y": -0.7841877195408034,
      "rightElbow_x": -0.7839237881788851,
      "rightElbow_y": -0.7595308656124881,
      "leftWrist_x": 1.1053133468309333,
      "leftWrist_y": -0.4171124691945409,
      "rightWrist_x": -1.1805359188909115,
      "rightWrist_y": -0.3559800804552275,
      "leftHip_x": 0.2816932413438119,
      "leftHip_y": -0.001915065584187949,
      "rightHip_x": -0.2816932413438119,
      "rightHip_y": 0.001915065584187949,
      "leftEar_x": 0.13098499711109998,
      "leftEar_y": -1.6914932739705983,
      "rightEar_x": -0.23659502228792398,
      "rightEar_y": -1.673189203310433,
      "leftJaw_x": 0.13098499711109998,
      "leftJaw_y": -1.4320762889559766,
      "rightJaw_x": -0.23659502228792398,
      "rightJaw_y": -1.4137722182958112,
      "headCenter_x": -0.05280501258841178,
      "headCenter_y": -2.0620889668486297
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.8067531931268004,
      "leftElbow_y": -0.8574839101060486,
      "rightElbow_x": -0.8508903358796099,
      "rightElbow_y": -0.8390782359915102,
      "leftWrist_x": 1.2114500480232928,
      "leftWrist_y": -0.5548334926400939,
      "rightWrist_x": -1.3191222422465934,
      "rightWrist_y": -0.55719364296053,
      "leftHip_x": 0.2549775373455353,
      "leftHip_y": 0.0025081782643987275,
      "rightHip_x": -0.2549775373455353,
      "rightHip_y": -0.0025081782643987275,
      "leftEar_x": 0.1245262368761857,
      "leftEar_y": -1.5489906846705774,
      "rightEar_x": -0.20743661619246048,
      "rightEar_y": -1.5265599305116606,
      "leftJaw_x": 0.1245262368761857,
      "leftJaw_y": -1.3116090275769168,
      "rightJaw_x": -0.20743661619246048,
      "rightJaw_y": -1.289178273418,
      "headCenter_x": -0.041455189658137395,
      "headCenter_y": -1.8881073376615214
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.8322325803089282,
      "leftElbow_y": -1.1481715928804317,
      "rightElbow_x": -0.8720964804976985,
      "rightElbow_y": -1.2558992490802023,
      "leftWrist_x": 1.2490542509935327,
      "leftWrist_y": -1.3251571787430367,
      "rightWrist_x": -1.3480153761553897,
      "rightWrist_y": -1.5014343799609835,
      "leftHip_x": 0.25345294889295283,
      "leftHip_y": 0.0021293489289658063,
      "rightHip_x": -0.25345294889295283,
      "rightHip_y": -0.0021293489289658063,
      "leftEar_x": 0.13577099559044029,
      "leftEar_y": -1.4370844806629455,
      "rightEar_x": -0.18826871411767526,
      "rightEar_y": -1.436030950190203,
      "leftJaw_x": 0.13577099559044029,
      "leftJaw_y": -1.2072958516482384,
      "rightJaw_x": -0.18826871411767526,
      "rightJaw_y": -1.206242321175496,
      "headCenter_x": -0.026248859263617495,
      "headCenter_y": -1.7653539506839557
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.6481614918533015,
      "leftElbow_y": -1.7389254788505955,
      "rightElbow_x": -1.0162339409050851,
      "rightElbow_y": -1.5772888246267553,
      "leftWrist_x": 0.902305987894463,
      "leftWrist_y": -1.971491747884659,
      "rightWrist_x": -0.737163969345399,
      "rightWrist_y": -2.374237069064956,
      "leftHip_x": 0.26814872209543733,
      "leftHip_y": -0.025432093467040392,
      "rightHip_x": -0.26814872209543733,
      "rightHip_y": 0.025432093467040392,
      "leftEar_x": 0.32989896521450196,
      "leftEar_y": -1.8923429293120413,
      "rightEar_x": -0.06624474286931144,
      "rightEar_y": -1.9333711081393414,
      "leftJaw_x": 0.32989896521450196,
      "leftJaw_y": -1.5266517695771722,
      "rightJaw_x": -0.06624474286931144,
      "rightJaw_y": -1.5676799484044717,
      "headCenter_x": 0.13182711117259524,
      "headCenter_y": -2.4557870506177264
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.7086114188550805,
      "leftElbow_y": -1.4788431423772055,
      "rightElbow_x": -0.7357428072582796,
      "rightElbow_y": -0.6552926482074901,
      "leftWrist_x": 0.35697702628434547,
      "leftWrist_y": -1.950081793248515,
      "rightWrist_x": -0.9442126053519883,
      "rightWrist_y": -0.573942922750479,
      "leftHip_x": 0.274756272024429,
      "leftHip_y": -0.013558346987754138,
      "rightHip_x": -0.274756272024429,
      "rightHip_y": 0.013558346987754138,
      "leftEar_x": -0.02495995708561052,
      "leftEar_y": -1.579473064550595,
      "rightEar_x": -0.35498992461051454,
      "rightEar_y": -1.552819999913814,
      "leftJaw_x": -0.02495995708561052,
      "leftJaw_y": -1.3256373330365898,
      "rightJaw_x": -0.35498992461051454,
      "rightJaw_y": -1.298984268399809,
      "headCenter_x": -0.18997494084806252,
      "headCenter_y": -1.9420955381420308
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.775883522106901,
      "leftElbow_y": -1.3942475535048033,
      "rightElbow_x": -0.925550464445528,
      "rightElbow_y": -1.4113789016241762,
      "leftWrist_x": 0.2013395786400215,
      "leftWrist_y": -1.4416359752420411,
      "rightWrist_x": -0.3598460946644782,
      "rightWrist_y": -1.4328410823323174,
      "leftHip_x": 0.26501803521172557,
      "leftHip_y": -0.001415139354594089,
      "rightHip_x": -0.26501803521172557,
      "rightHip_y": 0.001415139354594471,
      "leftEar_x": 0.10801446004138147,
      "leftEar_y": -1.5007057849598735,
      "rightEar_x": -0.2443414842558196,
      "rightEar_y": -1.4992475335339221,
      "leftJaw_x": 0.10801446004138147,
      "leftJaw_y": -1.2656875472028184,
      "rightJaw_x": -0.2443414842558196,
      "rightJaw_y": -1.2642292957768673,
      "headCenter_x": -0.06816351210721926,
      "headCenter_y": -1.8364461246128094
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
,   {
    "input": {
      "leftElbow_x": 0.8190679920790119,
      "leftElbow_y": -0.8474748936578841,
      "rightElbow_x": -0.8224443756148314,
      "rightElbow_y": -0.8948042071498991,
      "leftWrist_x": 0.8592827557047293,
      "leftWrist_y": -1.3697923634317752,
      "rightWrist_x": -0.8749857069671643,
      "rightWrist_y": -1.336768063348366,
      "leftHip_x": 0.2576837693149921,
      "leftHip_y": -0.00663728640788786,
      "rightHip_x": -0.2576837693149921,
      "rightHip_y": 0.006637286407888264,
      "leftEar_x": 0.1454056605046029,
      "leftEar_y": -1.603153488130202,
      "rightEar_x": -0.19352691786231288,
      "rightEar_y": -1.581113155766576,
      "leftJaw_x": 0.1454056605046029,
      "leftJaw_y": -1.3545120682713667,
      "rightJaw_x": -0.19352691786231288,
      "rightJaw_y": -1.3324717359077405,
      "headCenter_x": -0.024060628678855184,
      "headCenter_y": -1.958355516499967
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  },
   {
    "input": {
      "leftElbow_x": 0.848249363821046,
      "leftElbow_y": -1.15743440464119,
      "rightElbow_x": -0.814473209875383,
      "rightElbow_y": -1.2298533853549674,
      "leftWrist_x": 0.9909644496747231,
      "leftWrist_y": -1.6179488838201082,
      "rightWrist_x": -1.0822543169907317,
      "rightWrist_y": -1.631395510297179,
      "leftHip_x": 0.25966829003000746,
      "leftHip_y": 0.005160616469191836,
      "rightHip_x": -0.2596682900300071,
      "rightHip_y": -0.005160616469191836,
      "leftEar_x": 0.1369398407958092,
      "leftEar_y": -1.479047658248595,
      "rightEar_x": -0.19320365367315762,
      "rightEar_y": -1.4707607636482343,
      "leftJaw_x": 0.1369398407958092,
      "leftJaw_y": -1.2469241922839855,
      "rightJaw_x": -0.19320365367315762,
      "rightJaw_y": -1.2386372976836246,
      "headCenter_x": -0.02813190643867421,
      "headCenter_y": -1.8106526096266085
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  },
   {
    "input": {
      "leftElbow_x": 0.7671949099280815,
      "leftElbow_y": -1.9055917773478825,
      "rightElbow_x": -0.7460252554755047,
      "rightElbow_y": -1.929017180878787,
      "leftWrist_x": 0.754206582122221,
      "leftWrist_y": -2.568759002379778,
      "rightWrist_x": -0.798066519129151,
      "rightWrist_y": -2.5931275833443133,
      "leftHip_x": 0.31302770550124037,
      "leftHip_y": 0.012839660845048183,
      "rightHip_x": -0.31302770550124037,
      "rightHip_y": -0.012839660845048183,
      "leftEar_x": 0.19913591212928208,
      "leftEar_y": -1.852331926601294,
      "rightEar_x": -0.20054435070728396,
      "rightEar_y": -1.8570116042859721,
      "leftJaw_x": 0.19913591212928208,
      "leftJaw_y": -1.5609207897469735,
      "rightJaw_x": -0.20054435070728396,
      "rightJaw_y": -1.5656004674316515,
      "headCenter_x": -0.0007042192890009304,
      "headCenter_y": -2.273313228363573
    },
    "output": {
      "leftElbow": 0,
      "rightElbow": 0,
      "leftWrist": 0,
      "rightWrist": 0,
      "leftHip": 1,
      "rightHip": 1,
      "head": 1
    }
  }
];

// Use an IIFE to train the network asynchronously before running main.
(async () => {
  try {
    console.log("Training network...");
    await net.trainAsync(trainingData, {
      iterations: 1000,
      errorThresh: 0.005,
      log: true,
      logPeriod: 100
    });
    console.log("Training complete.");
    main().catch(err => {
      console.error("Error initializing pose detection:", err);
    });
  } catch (error) {
    console.error("Error during network training:", error);
  }
})();
