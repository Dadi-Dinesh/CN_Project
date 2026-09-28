const express = require('express');


const app = express()

app.get("/", (req, res) => {
  res.status(200).send("hello from serverB");
});

app.listen(5000, () => {
  console.log("serverB started on port 5000");
});
