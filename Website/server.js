const express = require('express');
const app = express();
const port = 3000;

app.use(express.json()); // Parse incoming JSON

app.post('/sensor', (req, res) => {
  const data = req.body;

  console.log('Received data:');
  for (const key in data) {
    console.log(`${key}: ${data[key]}`);
  }

  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
