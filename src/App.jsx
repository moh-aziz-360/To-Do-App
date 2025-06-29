// src/App.jsx
import React from "react";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "./firebase";
import { Navigate, Outlet } from "react-router-dom";

const App = () => {
  const [user, loading] = useAuthState(auth);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (user) {
    return <Outlet />;
  } else {
    return <Navigate to="/login" />;
  }
};

export default App;
