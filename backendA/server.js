const express = require("express");

const app = express();
const PORT = 4000;

app.get("/", (req, res) => {
  res.send("hello from server 1");
});

app.listen(PORT, () => {
  console.log("server 1 running on port " + PORT);
});
