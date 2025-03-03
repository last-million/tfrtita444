// frontend/src/components/Login.jsx
import React, { useState } from "react";
import axios from "axios";

const Login = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // Make sure your VITE_API_URL is something like https://ajingolik.fun/api
      const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
      const response = await axios.post(`${baseURL}/auth/token`, {
        username,
        password,
      });

      const { access_token } = response.data;
      // Save token to localStorage or cookie
      localStorage.setItem("token", access_token);

      // Redirect or reload
      window.location.href = "/";
    } catch (err) {
      console.error("Login error:", err);
      setError("Invalid credentials");
    }
  };

  return (
    <div className="login-container" style={{ maxWidth: "300px", margin: "0 auto" }}>
      <h2>Login</h2>
      {error && <div style={{ color: "red", marginBottom: "10px" }}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div style={{ marginTop: "10px" }}>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit" style={{ marginTop: "15px" }}>
          Login
        </button>
      </form>
    </div>
  );
};

export default Login;
