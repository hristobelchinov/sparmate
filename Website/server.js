const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());

app.post('/sensor', (req, res) => {
  const { value } = req.body;
  console.log('Received value from ESP:', value);
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});