import mongoose from "mongoose";

/**
 * Connect to MongoDB Atlas using the MONGO_URI environment variable.
 * Exits the process if the connection cannot be established.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("❌ Database connection error:", error.message);
    process.exit(1);
  }
};

export default connectDB;
