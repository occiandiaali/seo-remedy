import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    // Falls back to a local instance if process.env.MONGO_URI isn't configured yet
    const conn = await mongoose.connect(
      process.env.MONGO_URI || "mongodb://127.0.0.1:27017/seo-remediator",
    );
    console.log(`🍃 MongoDB Cluster Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Database initialization error: ${error.message}`);
    process.exit(1);
  }
};
