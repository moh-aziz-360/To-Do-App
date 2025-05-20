// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import App from "./App";
import Register from "./pages/RegisterPage/Register";
import Login from "./pages/LoginPage/Login";
import Todo from "./components/Todo";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="register" element={<Register />} />
        <Route path="login" element={<Login />} />
        <Route path="todo" element={<Todo />} />
      </Routes>
    </Router>
  </React.StrictMode>
);
