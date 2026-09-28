const express = require("express");

const app = express();
const PORT = 5000;

app.get("/", (req, res) => {
  res.send("hello from server 2");
});

app.listen(PORT, () => {
  console.log("server 2 running on port " + PORT);
});
