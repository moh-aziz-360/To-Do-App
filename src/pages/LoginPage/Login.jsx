import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../../firebase";
import { Link } from "react-router-dom";
import "./Login.css";
import securityImg from "../../assets/Security On-amico.png";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Check if we have a saved profile picture in localStorage
      try {
        const storageData = localStorage.getItem("todoapp_profile_picture");
        if (storageData) {
          const parsedData = JSON.parse(storageData);
          if (parsedData.userId === user.uid && parsedData.photoURL) {
            console.log(
              "Found saved profile picture in localStorage after login"
            );

            // Update the user's profile with the saved picture if needed
            if (!user.photoURL || user.photoURL !== parsedData.photoURL) {
              try {
                await updateProfile(user, { photoURL: parsedData.photoURL });
                console.log(
                  "Updated user profile with saved picture after login"
                );

                // Also check backup storage
                const backupData = localStorage.getItem(
                  "todoapp_profile_picture_backup"
                );
                if (backupData) {
                  const parsedBackupData = JSON.parse(backupData);
                  if (
                    parsedBackupData.userId === user.uid &&
                    parsedBackupData.photoURL &&
                    parsedBackupData.timestamp > parsedData.timestamp
                  ) {
                    // Use the more recent backup
                    await updateProfile(user, {
                      photoURL: parsedBackupData.photoURL,
                    });
                    console.log(
                      "Updated user profile with more recent backup picture"
                    );
                  }
                }
              } catch (profileError) {
                console.error(
                  "Error updating profile after login:",
                  profileError
                );
              }
            }
          }
        }
      } catch (storageError) {
        console.error("Error checking localStorage after login:", storageError);
      }

      navigate("/todo");
    } catch (error) {
      console.error("Error logging in:", error);
      setError(
        "Failed to log in. Please check your credentials and try again."
      );
    }
  };

  return (
    <div className="login-page">
      <div className="login-content-wrapper">
        <div className="login-image-section">
          <img src={securityImg} alt="Secure Login" className="login-image" />
        </div>
        <div className="login-container">
          <h2>Login</h2>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label>
                <input
                  placeholder="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-label="Email Address"
                  autoComplete="email"
                />
              </label>
            </div>

            <div className="form-group">
              <label>
                <input
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  aria-label="Password"
                  autoComplete="current-password"
                />
              </label>
            </div>

            <button type="submit">Sign In</button>
          </form>
          <p className="direct">
            Don't have an account? <Link to="/register">Create account</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
