import admin from "firebase-admin";
import fs from "fs/promises";

const credentialPath = "C:/Users/USER/Downloads/spd-appilation-firebase-adminsdk-fbsvc-b29bcbd2d7.json";
const bucketName = "spd-appilation.appspot.com";

async function run() {
  try {
    const serviceAccount = JSON.parse(await fs.readFile(credentialPath, "utf-8"));
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: bucketName
    });

    const bucket = admin.storage().bucket();
    const file = bucket.file("test-upload.txt");
    
    console.log("Attempting to upload file to Firebase Storage...");
    await file.save("This is a test file to check if Firebase Storage works on the Spark plan.", {
      contentType: "text/plain"
    });
    
    console.log("Upload successful!");
    
    await file.delete();
    console.log("Cleanup successful!");
    
    process.exit(0);
  } catch (error) {
    console.error("Firebase Storage Error:", error.message);
    process.exit(1);
  }
}

run();
