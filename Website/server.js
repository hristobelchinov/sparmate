const express = require ('express');
const app = express();


app.get('/', (req, res) =>{
    res.send('If you are reading this , you will be fingered tonight');
});