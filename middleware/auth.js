// import jwt from "jsonwebtoken";
// import User from "../models/User.js";

// const JWT_SECRET = process.env.JWT_SECRET || "super-secure-dev-fallback-secret";

// export const protect = async (req, res, next) => {
//   const token = req.cookies?.token;

//   if (!token) {
//     return res.status(401).redirect("/auth/login");
//   }

//   try {
//     const decoded = jwt.verify(token, JWT_SECRET);
//     req.user = await User.findById(decoded.id).select("-password");
//     if (!req.user) return res.status(401).redirect("/auth/login");
//     next();
//   } catch (err) {
//     res.clearCookie("token");
//     return res.status(401).redirect("/auth/login");
//   }
// };

import jwt from "jsonwebtoken";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET || "super-secure-dev-fallback-secret";
//const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error(
    "❌ CRITICAL ERROR: JWT_SECRET environment variable is completely missing!",
  );
  process.exit(1);
}

export const protect = async (req, res, next) => {
  const token = req.cookies?.token;

  // Helper function to handle failures gracefully depending on request type
  const handleUnauthorized = (message) => {
    // If the request expects JSON or comes from a fetch/XHR script, send a 401 data object
    if (
      req.xhr ||
      req.headers.accept?.includes("application/json") ||
      req.path.startsWith("/auth/")
    ) {
      return res.status(401).json({
        success: false,
        message: message || "Session expired. Please log in again.",
      });
    }
    // Otherwise, perform a traditional hard browser redirect for regular page requests
    res.clearCookie("token");
    return res.redirect("/auth/login");
  };

  if (!token) {
    return handleUnauthorized("No session token found.");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Set a race-condition protection timeout for the database lookups
    const userPromise = User.findById(decoded.id).select("-password");
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Database connection timed out")),
        4000,
      ),
    );

    // Race the database read against our timeout safeguard
    req.user = await Promise.race([userPromise, timeoutPromise]);

    if (!req.user) {
      return handleUnauthorized("User account no longer exists.");
    }

    return next();
  } catch (err) {
    console.error("🔒 Security Middleware Exception Log:", err.message);

    if (err.message === "Database connection timed out") {
      return handleUnauthorized(
        "The server lost connection to the user database. Please try again shortly.",
      );
    }

    return handleUnauthorized("Invalid or expired session security tokens.");
  }
};
