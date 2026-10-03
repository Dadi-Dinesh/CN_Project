const express = require("express");

const app = express();
const PORT = 6000;

app.get("/", (req, res) => {
  res.send("hello from backend B");
});

app.listen(PORT, () => {
  console.log(`backend B server running on http://localhost:${PORT}`);
}); 
