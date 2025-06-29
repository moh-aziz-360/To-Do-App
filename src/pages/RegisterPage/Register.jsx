import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth } from "../../firebase";
import { Link } from "react-router-dom";
import "./Register.css";
import notesImg from "../../assets/Taking notes-amico.png";

const Register = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [passwordStrength, setPasswordStrength] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const navigate = useNavigate();

  // Calculate password strength
  useEffect(() => {
    if (!password) {
      setPasswordStrength("");
      return;
    }

    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^a-zA-Z0-9]/.test(password)) strength += 1;

    if (strength <= 2) {
      setPasswordStrength("weak");
    } else if (strength === 3) {
      setPasswordStrength("medium");
    } else {
      setPasswordStrength("strong");
    }
  }, [password]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    setFormSubmitted(true);

    // Password validation
    const passwordErrors = [];
    if (password.length < 8) passwordErrors.push("at least 8 characters");
    if (!/[A-Z]/.test(password)) passwordErrors.push("an upper case character");
    if (/[0-9]/.test(password) === false)
      passwordErrors.push("a numeric character");
    if (/[^a-zA-Z0-9]/.test(password) === false)
      passwordErrors.push("a non-alphanumeric character");

    if (passwordErrors.length > 0) {
      setError(`Password must contain: ${passwordErrors.join(", ")}.`);
      setIsLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Set display name
      await updateProfile(user, { displayName });

      // Redirect with a slight delay for better UX
      setTimeout(() => {
        navigate("/todo");
      }, 800);
    } catch (error) {
      console.error("Error registering:", error);
      if (
        error.code === "auth/password-does-not-meet-requirements" ||
        error.message?.includes("Missing password requirements")
      ) {
        setError(
          "Password does not meet requirements. It must contain at least 8 characters, an upper case character, a numeric character, and a non-alphanumeric character."
        );
      } else if (error.code === "auth/email-already-in-use") {
        setError(
          "This email is already registered. Please use a different email or login."
        );
      } else {
        setError("Failed to register. Please try again.");
      }
      setIsLoading(false);
    }
  };

  // Get strength label for accessibility
  const getStrengthLabel = () => {
    if (passwordStrength === "weak") return "Weak password";
    if (passwordStrength === "medium") return "Medium strength password";
    if (passwordStrength === "strong") return "Strong password";
    return "";
  };

  return (
    <div className="register-page">
      <div className="register-content-wrapper">
        <div className="register-image-section">
          <img src={notesImg} alt="Create Account" className="register-image" />
        </div>
        <div className="register-container">
          <h2>Sign Up</h2>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={handleRegister} className="register-form">
            <div className="form-group">
              <label>
                <input
                  placeholder="Full Name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  aria-label="Full Name"
                  autoComplete="name"
                />
              </label>
            </div>

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
                  autoComplete="new-password"
                  aria-describedby={password ? "password-strength" : undefined}
                />
              </label>

              {password && (
                <div className="password-feedback">
                  <div className="password-strength" id="password-strength">
                    <div
                      className={`password-strength-bar ${passwordStrength}`}
                      role="progressbar"
                      aria-valuenow={
                        passwordStrength === "weak"
                          ? 33
                          : passwordStrength === "medium"
                          ? 66
                          : passwordStrength === "strong"
                          ? 100
                          : 0
                      }
                      aria-valuemin="0"
                      aria-valuemax="100"
                      aria-label={getStrengthLabel()}
                    ></div>
                  </div>
                  <div className="password-strength-text">
                    <span
                      className={
                        passwordStrength === "weak" ? "active weak" : ""
                      }
                      aria-hidden={passwordStrength !== "weak"}
                    >
                      Weak
                    </span>
                    <span
                      className={
                        passwordStrength === "medium" ? "active medium" : ""
                      }
                      aria-hidden={passwordStrength !== "medium"}
                    >
                      Medium
                    </span>
                    <span
                      className={
                        passwordStrength === "strong" ? "active strong" : ""
                      }
                      aria-hidden={passwordStrength !== "strong"}
                    >
                      Strong
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button type="submit" disabled={isLoading}>
              {isLoading ? "Creating Account..." : "Sign Up"}
            </button>
          </form>
          <p className="direct">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
