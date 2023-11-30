const fetch = require("node-fetch");
const mailgun = require("mailgun-js");
const { Storage } = require("@google-cloud/storage");
const AWS = require("aws-sdk");
const fs = require("fs");
require('dotenv').config();

const DOMAIN = "demo.pranavkulkarni.me";
const mg = mailgun({
  apiKey: process.env.MAIL_GUN_API_KEY,
  domain: DOMAIN,
});

const gcpCredentials = JSON.parse(Buffer.from(process.env.GCP_PRIVATE_KEY, 'base64').toString('utf-8'));
const storage = new Storage({
  projectId: gcpCredentials.project_id,
  credentials: gcpCredentials,
});

console.log(gcpCredentials);

function generateTimestamp() {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${padZero(now.getMonth() + 1)}${padZero(now.getDate())}_${padZero(now.getHours())}${padZero(now.getMinutes())}${padZero(now.getSeconds())}`;
  return timestamp;
}

function padZero(value) {
  return value < 10 ? `0${value}` : value;
}

const dynamoDBTableName = "Csye6225_Demo_DynamoDB";
const bucketName = process.env.GCS_BUCKET_NAME;
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async function handler(event) {
  let fileName;
  try {
    console.log("EVENT SNS", event.Records[0].Sns);
    console.log("EVENT", event);
    const timestamp = generateTimestamp();
    const eventData = JSON.parse(event.Records[0].Sns.Message);
    console.log(eventData);
    const releaseUrl = eventData.submission_url;
    const recipientEmail = eventData.email;
    const assignmentId = eventData.assignmentId;

    console.log("URL:", releaseUrl);
    console.log("EMAIL:", recipientEmail);
    console.log("Assignment ID : ", assignmentId);

    const response = await fetch(releaseUrl);

    console.log('response', response);

    if (!response.ok) {
      console.log("Download Failed Fetch");
      throw new Error(`Failed to download release: ${response.statusText}`);
    }
    const fileContents = await response.buffer();
    fileName = `${recipientEmail}/${assignmentId}/submision_${timestamp}.zip`;

    // Update DynamoDB status to "Email Sending"
    await trackEmail(recipientEmail, "Email Sending");

    await uploadToGCS(fileContents, fileName);

    // Generate signed URL for the object
    const objectUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
    const signedUrl = await generateSignedUrl(bucketName, fileName, { expiresIn: 3600 });

    await sendSuccessEmail(
      recipientEmail,
      "Download Successful",
      "The release was successfully downloaded and uploaded to the Bucket.",
      objectUrl,
      signedUrl
    );
    // Update DynamoDB status to "Download Successful Email Sent"
    await trackEmail(recipientEmail, "Download Successful Email Sent");
  } catch (error) {
    fileName = fileName || "unknownFileName.zip"
    const eventData = JSON.parse(event.Records[0].Sns.Message);
    console.error("Error:", error);
    const recipientEmail = eventData.email;

    // Send error email
    await sendFailureEmail(
      recipientEmail,
      "Download Failed",
      `The release was not downloaded. Error: ${error.message}`,
      fileName
    );
    // Update DynamoDB status to "Download Failed Email Sent"
    await trackEmail(recipientEmail, "Download Failed Email Sent");
  }
};

// Upload Submission
async function uploadToGCS(fileContents, fileName) {
  console.log("This is the bucket name : ", bucketName);
  const bucket = storage.bucket(bucketName);
  console.log("The file name is fileName: ", fileName);
  const file = bucket.file(fileName);
  return new Promise((resolve, reject) => {
    const writeStream = file.createWriteStream();
    writeStream
      .on("error", reject)
      .on("finish", () => resolve(fileContents))
      .end(fileContents);
  });
}

// Mail Gun
async function sendSuccessEmail(to, subject, message, objectUrl, signedUrl) {
  try {
    const data = {
      from: "csye6225@demo.pranavkulkarni.me",
      to: to,
      subject: subject,
      text: `${message}\n\nDownload the release from the following URL:\n${objectUrl}\n\nSigned URL for direct access:\n${signedUrl}`,
    };

    await mg.messages().send(data);
  } catch (error) {
    console.error("Error sending success email:", error);
    // If there's an error sending the email, update DynamoDB status to "Email Sending Failed"
    await trackEmail(to, "Email Sending Failed");
    throw error; // Re-throw the error to maintain the original behavior
  }
}

async function sendFailureEmail(to, subject, message, fileName) {
  const data = {
    from: "csye6225@demo.pranavkulkarni.me",
    to: to,
    subject: subject,
    text: `${message}`,
  };

  await mg.messages().send(data);
}

// Function to generate a signed URL
async function generateSignedUrl(bucketName, fileName, options = {}) {
  const [url] = await storage
    .bucket(bucketName)
    .file(fileName)
    .getSignedUrl({
      action: "read",
      expires: Date.now() + options.expiresIn * 1000, // Convert expiresIn from seconds to milliseconds
    });

  return url;
}

// DynamoDB
async function trackEmail(recipientEmail, status) {
  const params = {
    TableName: dynamoDBTableName,
    Item: {
      id: Date.now().toString(),
      status: status,
      timestamp: new Date().toISOString(),
      email: recipientEmail,
    },
  };

  return dynamoDB.put(params).promise();
}
