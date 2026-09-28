const express = require("express");

const app = express();
const PORT = 4000;

app.get("/", (req, res) => {
  res.send("hello from backend A");
});

app.listen(PORT, () => {
  console.log(`backend A server running on http://localhost:${PORT}`);
});
