import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { ZipArchive } from "archiver";

import { connectDB } from "./config/db.js";
import User from "./models/User.js";
import { protect } from "./middleware/auth.js";
import { crawlSite } from "./services/crawler.js";
import { remediatePage } from "./services/transformer.js";
import {
  generateVerificationToken,
  getCleanDomain,
  verifyDomainOwnership,
} from "./services/verify.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "super-secure-dev-fallback-secret";
//const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error(
    "❌ CRITICAL ERROR: JWT_SECRET environment variable is completely missing!",
  );
  process.exit(1);
}

// Active runtime connections
connectDB();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static("public"));

// Volatile runtime caching for file generation references
let ScanSessionDatabase = {};

/* ================= PUBLIC SAAS ROUTES ================= */
app.get("/", (req, res) => {
  res.render("index", { user: req.cookies?.token ? true : false });
});

app.get("/auth/login", (req, res) => {
  res.render("login", { error: null, success: null }); // Added success fallback parameter
});

app.post("/auth/register", async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please fill in both the email and password fields.",
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Security constraint: Password must be at least 6 characters long.",
      });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists. Try signing in.",
      });
    }

    await User.create({ email, password });
    return res
      .status(200)
      .json({ success: true, message: "Account created successfully!" });
  } catch (err) {
    console.error("Registration tracking exception:", err.message);
    return res.status(500).json({
      success: false,
      message: "System processing error during initialization.",
    });
  }
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Missing fields. Please submit complete credentials.",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "We couldn't find an account matching that email address.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password credentials. Please retry.",
      });
    }

    // Generate Verification JWT
    // const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });

    // Set cookie cleanly
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      //maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Days
      maxAge: 1 * 24 * 60 * 60 * 1000, // 1 Day
    });

    // Send JSON signal allowing frontend window control
    return res.status(200).json({ success: true, redirectTo: "/dashboard" });
  } catch (err) {
    console.error("Login tracking exception:", err.message);
    return res.status(500).json({
      success: false,
      message: "Critical identity pipeline mapping failure.",
    });
  }
});

// app.post("/auth/register", async (req, res) => {
//   const { email, password } = req.body;
//   try {
//     if (!email || !password) {
//       return res.render("login", {
//         error: "Please fill in both the email and password fields.",
//       });
//     }
//     if (password.length < 6) {
//       return res.render("login", {
//         error:
//           "Security constraint: Password must be at least 6 characters long.",
//       });
//     }

//     const existing = await User.findOne({ email });
//     if (existing)
//       return res.render("login", {
//         error: "Cannot register this email. Try signing in instead.",
//       });

//     await User.create({ email, password });
//     res.render("login", {
//       error: "🎉 Account created successfully! Go ahead and log in below.",
//     });
//   } catch (err) {
//     console.error("Registration engine trace error:", err.message);
//     res.render("login", {
//       error:
//         "System processing error. Please try again or reach out to support.",
//     });
//   }
// });

// app.post("/auth/login", async (req, res) => {
//   const { email, password } = req.body;
//   try {
//     if (!email || !password) {
//       return res.render("login", {
//         error: "Missing credentials. Please check your inputs.",
//       });
//     }

//     const user = await User.findOne({ email });
//     if (!user) {
//       return res.render("login", {
//         error: "We couldn't find an account matching that email address.",
//       });
//     }

//     const isMatch = await user.comparePassword(password);
//     if (!isMatch) {
//       return res.render("login", {
//         error:
//           "Incorrect password. Please verify your credentials and try again.",
//       });
//     }

//     //const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
//     const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "1d" });
//     res.cookie("token", token, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === "production",
//       //maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Days
//       maxAge: 1 * 24 * 60 * 60 * 1000, // 1 Day
//     });

//     res.redirect("/dashboard");
//   } catch (err) {
//     console.error("Login engine trace error:", err.message);
//     res.render("login", {
//       error:
//         "Authentication engine failed to verify your identity. Please retry.",
//     });
//   }
// });

app.get("/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});

/* ================= PROTECTED APPLICATION CONSOLE ================= */
app.get("/dashboard", protect, (req, res) => {
  res.render("dashboard", { user: req.user });
});

// app.post("/api/scan", protect, async (req, res) => {
//   const { targetUrl } = req.body;
//   if (!targetUrl)
//     return res.status(400).send("Target validation context lost.");

//   try {
//     const sitePages = await crawlSite(targetUrl, 6);
//     const results = [];

//     Object.entries(sitePages).forEach(([url, html]) => {
//       const { optimizedHtml, issues, fixes } = remediatePage(url, html);
//       results.push({ url, rawHtml: html, optimizedHtml, fixes });
//     });

//     const sessionId = `session_${Date.now()}`;
//     ScanSessionDatabase[sessionId] = { targetUrl, results };

//     res.render("partials/results", {
//       session: ScanSessionDatabase[sessionId],
//       sessionId,
//     });
//   } catch (err) {
//     res
//       .status(500)
//       .send(
//         `<div class="text-red-400 font-medium">Pipeline Error: ${err.message}</div>`,
//       );
//   }
// });
app.post("/api/scan", protect, async (req, res) => {
  const targetUrl = req.body?.targetUrl;
  // if (!targetUrl)
  //   return res.status(400).send("Target validation context lost.");
  if (!targetUrl) {
    // Setting this header tells HTMX to swap the content anyway, even on a 400 error status!
    res.setHeader("HX-Retarget", "#dashboard-results");
    return res
      .status(400)
      .send("Target validation context lost. URL input was missing.");
  }

  // Extract clean root host identifier context (e.g., "myportfolio.com")
  const targetDomain = getCleanDomain(targetUrl);
  if (!targetDomain)
    return res.status(400).send("Invalid URL structure submitted.");

  try {
    // Fetch fresh user data status directly from MongoDB instance
    const currentUser = await User.findById(req.user._id);

    // 🔍 DB CHECK: Is this domain already permanently verified for this user account?
    const alreadyVerified = currentUser.verifiedDomains.includes(targetDomain);

    // // 🔒 GUARD 1: Execute active site ownership handshakes
    // const isAuthorized = await verifyDomainOwnership(targetUrl, req.user._id);

    // if (!isAuthorized) {
    //   const personalToken = generateVerificationToken(req.user._id);

    //   // Halt crawl execution and return a descriptive setup instruction view
    //   return res.status(200).send(`
    //     <div class="p-5 rounded-2xl bg-slate-950 border border-yellow-500/30 text-slate-200 space-y-3">
    //       <div class="flex items-center gap-2 text-yellow-400 font-bold text-sm">
    //         <span>⚠️</span> Domain Ownership Verification Required
    //       </div>
    //       <p class="text-xs text-slate-400 leading-relaxed">
    //         To prevent unauthorized crawler abuse, you must verify that you own or manage <code class="text-teal-400">${targetUrl}</code> before running optimization pipelines.
    //       </p>
    //       <div class="p-3 bg-slate-900 rounded-lg border border-slate-800 text-[11px] font-mono space-y-1">
    //         <span class="text-slate-500">// Copy and paste this tag into your site's &lt;head&gt; region:</span>
    //         <code class="text-cyan-400 block select-all">&lt;meta name="remedial-verification" content="${personalToken}"&gt;</code>
    //       </div>
    //       <p class="text-[10px] text-slate-500 italic">
    //         Once added, redeploy your site and click "Run Optimization" again to authorize your session.
    //       </p>
    //     </div>
    //   `);
    // }

    if (!alreadyVerified) {
      // Execute the live fallback crawling handshake check
      const hasToken = await verifyDomainOwnership(targetUrl, req.user._id);

      if (!hasToken) {
        const personalToken = generateVerificationToken(req.user._id);
        return res.status(200).send(`
          <div class="p-5 rounded-2xl bg-slate-950 border border-yellow-500/30 text-slate-200 space-y-3">
            <div class="flex items-center gap-2 text-yellow-400 font-bold text-sm">
              <span>⚠️</span> Domain Ownership Verification Required
            </div>
            <p class="text-xs text-slate-400 leading-relaxed">
              You must verify ownership of <code class="text-teal-400">${targetDomain}</code> before running optimization scans.
            </p>
            <div class="p-3 bg-slate-900 rounded-lg border border-slate-800 text-[11px] font-mono space-y-1">
              <span class="text-slate-500">// Copy and paste this tag into your site's &lt;head&gt; region:</span>
              <code class="text-cyan-400 block select-all">&lt;meta name="remedial-verification" content="${personalToken}"&gt;</code>
            </div>
          </div>
        `);
      }

      // 🎉 Success! Save the domain to the user's document array permanently
      currentUser.verifiedDomains.push(targetDomain);
      await currentUser.save();
      console.log(
        `🔒 Domain [${targetDomain}] verified and saved permanently for user ${currentUser.email}`,
      );
    }

    const sitePages = await crawlSite(targetUrl, 6);
    const results = [];
    let cumulativeFixes = 0;

    Object.entries(sitePages).forEach(([url, html]) => {
      const { optimizedHtml, issues, fixes } = remediatePage(url, html);
      // Track length of total automated remedies injected
      cumulativeFixes += (fixes || []).length;
      results.push({ url, rawHtml: html, optimizedHtml, fixes: fixes || [] });
    });

    // Generate dynamic metrics mapping profile values
    const performanceBefore = Math.max(45, 92 - cumulativeFixes * 4);
    const performanceAfter = Math.min(
      100,
      performanceBefore + cumulativeFixes * 3.5,
    );

    const sessionId = `session_${Date.now()}`;

    if (typeof ScanSessionDatabase === "undefined")
      global.ScanSessionDatabase = {};

    // Match all property schemas expected by the frontend engine cards
    ScanSessionDatabase[sessionId] = {
      targetUrl,
      results,
      globalScoreDelta: {
        before: Math.round(performanceBefore),
        after: Math.round(performanceAfter),
      },
    };

    res.render("partials/results", {
      session: ScanSessionDatabase[sessionId],
      sessionId,
    });
  } catch (err) {
    console.error("Pipeline Engine Exception:", err.message);
    res
      .status(500)
      .send(
        `<div class="text-red-400 font-medium">Pipeline Error: ${err.message}</div>`,
      );
  }
});

// Issue 2 Fix: Endpoint generating archive on-the-fly
app.get("/api/export/:sessionId", protect, (req, res) => {
  const { sessionId } = req.params;
  const session = ScanSessionDatabase[sessionId];

  if (!session)
    return res.status(404).send("Build optimization timeline expired.");

  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="optimized-distribution.zip"`,
  );

  //const archive = archiver("zip", { zlib: { level: 9 } });
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.pipe(res);

  session.results.forEach((page, index) => {
    const parsedUrl = new URL(page.url);
    let filename = parsedUrl.pathname.slice(1) || "index.html";
    if (!filename.endsWith(".html")) filename += ".html";

    archive.append(page.optimizedHtml, { name: `optimized/${filename}` });
  });

  archive.finalize();
});

app.listen(PORT, () =>
  console.log(
    `🚀 Automated Remediation Suite running: http://localhost:${PORT}`,
  ),
);
