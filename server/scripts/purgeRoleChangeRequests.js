import "dotenv/config";
import mongoose from "mongoose";

async function run() {
  const confirm = String(process.env.CONFIRM_ROLE_REQUEST_PURGE || "")
    .trim()
    .toUpperCase();

  if (confirm !== "YES") {
    console.error(
      "Set CONFIRM_ROLE_REQUEST_PURGE=YES to run this cleanup script.",
    );
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const collectionName = "rolechangerequests";
  const exists = await mongoose.connection.db
    .listCollections({ name: collectionName })
    .toArray();

  if (!exists.length) {
    console.log(
      "RoleChangeRequest collection does not exist; nothing to delete.",
    );
    await mongoose.disconnect();
    return;
  }

  const result = await mongoose.connection.db
    .collection(collectionName)
    .deleteMany({});
  console.log(
    `Deleted ${result.deletedCount || 0} role change request document(s).`,
  );

  try {
    await mongoose.connection.db.collection(collectionName).drop();
    console.log("Dropped RoleChangeRequest collection.");
  } catch (err) {
    const message = String(err?.message || "").toLowerCase();
    if (
      err?.codeName === "NamespaceNotFound" ||
      message.includes("ns not found")
    ) {
      console.log("RoleChangeRequest collection already absent.");
    } else {
      throw err;
    }
  }

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("purgeRoleChangeRequests failed:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
