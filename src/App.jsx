// src/App.jsx
import React from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "./firebase";
import { Navigate } from "react-router-dom";

const App = () => {
  const [user] = useAuthState(auth);

  if (user) {
    return <Navigate to="/todo" />;
  } else {
    return <Navigate to="/login" />;
  }
};

export default App;
