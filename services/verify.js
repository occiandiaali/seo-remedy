import crypto from "crypto";

//Generates a unique tracking token based on the user's database ID

export function generateVerificationToken(userId) {
  return crypto
    .createHmac("sha256", "verification-salt-key")
    .update(userId.toString())
    .digest("hex")
    .substring(0, 16);
}

/**
 * Normalizes any URL string into a clean root host string (e.g., "example.com")
 */
export function getCleanDomain(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    // Removes 'www.' if present to ensure matching normalization consistency
    return parsed.host.replace(/^www\./, "");
  } catch (err) {
    return null;
  }
}

/**
 * Inspects the target landing page for our validation meta tag signature
 * Built entirely on the native Fetch API
 */
export async function verifyDomainOwnership(targetUrl, userId) {
  // Create an AbortController to cleanly enforce our request timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const expectedToken = generateVerificationToken(userId);

    // Parse the URL to target the root domain explicitly
    const parsedUrl = new URL(targetUrl);
    const rootTarget = `${parsedUrl.protocol}//${parsedUrl.host}`;

    // Execute the native network request
    const response = await fetch(rootTarget, {
      signal: controller.signal,
      headers: {
        "User-Agent": "RemedialBot/1.0 (Domain Ownership Verification)",
      },
    });

    // Clear the timeout if the request resolves fast enough
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(
        `Domain verification returned non-200 status: ${response.status}`,
      );
      return false;
    }

    // Extract the raw HTML string text
    const html = await response.text();

    // Check if our unique meta tag signature is present in the source string
    const stringMatch = `meta name="remedial-verification" content="${expectedToken}"`;
    return html.includes(stringMatch);
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      console.error(
        "❌ Domain ownership validation failed: Request timed out after 4000ms.",
      );
    } else {
      console.error(
        "❌ Domain authorization verification network fault:",
        err.message,
      );
    }

    return false;
  }
}
