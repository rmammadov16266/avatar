// src/api.js
const API =
  process.env.REACT_APP_API_BASE || "http://localhost:8000"; // for local testing

export const apiUrl = API; // you can import this anywhere in your code
