const fetch = require("node-fetch");
const mailgun = require("mailgun-js");
const { Storage } = require("@google-cloud/storage");
const AWS = require("aws-sdk");
const fs = require("fs");
require('dotenv').config();

const DOMAIN = "demo.pranavkulkarni.me";
const mg = mailgun({
  apiKey: "8f70a0f8526ee4d091938fa18ea9398f-5d2b1caa-f761dede",
  domain: DOMAIN,
});


const gcpCredentials =  JSON.parse(Buffer.from(process.env.GCP_PRIVATE_KEY, 'base64').toString('utf-8'));
const storage = new Storage({
  projectId: gcpCredentials.project_id,
  credentials: gcpCredentials,
});

console.log(gcpCredentials)

function generateTimestamp() {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${padZero(now.getMonth() + 1)}${padZero(now.getDate())}_${padZero(now.getHours())}${padZero(now.getMinutes())}${padZero(now.getSeconds())}`;
  return timestamp;
}

function padZero(value) {
  return value < 10 ? `0${value}` : value;
}

const dynamoDBTableName = "Csye6225_Demo_DynamoDB";
const bucketName = process.env.GCS_BUCKET_NAME
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async function handler(event) {
  try {
    // console.log(gcpCredentials);
    console.log("EVENT SNS", event.Records[0].Sns);
    console.log("EVENT", event);
    const timestamp = generateTimestamp();

    const eventData = JSON.parse(event.Records[0].Sns.Message);
    console.log(eventData)

    const releaseUrl = eventData.submission_url;
    const recipientEmail = eventData.email;
    const assignmentId = eventData.assignmentId;
    

    console.log("URL:", releaseUrl);
    console.log("EMAIL:", recipientEmail);
    console.log("Assignment ID : ",assignmentId);

    const response = await fetch(releaseUrl);
    console.log('response',response)
    if (!response.ok){
      console.log("Download Failed Fetch")
      throw new Error(`Failed to download release: ${response.statusText}`);
    }
    // Convert the response body to a Buffer
    const fileContents = await response.buffer();

    // Upload to Google Cloud Storage
    const fileName = `${recipientEmail}/${assignmentId}/submision_${timestamp}.zip`;
    
    // Set a suitable file name
    await uploadToGCS(fileContents, fileName);

    // Send email
    await sendEmail(
      recipientEmail,
      "Download successful",
      `The release was successfully downloaded and uploaded to Bucket`
    );

    // Track email in DynamoDB
    await trackEmail(recipientEmail, "Download successful");
  } catch (error) {
    console.error("Error:", error);

    // Send error email
    await sendEmail(
      event.email,
      "Download failed",
      `Error occurred: ${error.message}`
    );

    // Track error email in DynamoDB
    await trackEmail(event.email, "Download failed");
  }
};

// Upload Submission 
async function uploadToGCS(fileContents, fileName) {
  console.log("This is the bucket name : ", bucketName)
  const bucket = storage.bucket(bucketName);
  console.log("The file name is fileName: ",fileName)
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
async function sendEmail(to, subject, message) {
  const data = {
    from: "csye6225@demo.pranavkulkarni.me",
    to: "pranavkulkarni1024@gmail.com", // Use 'to' parameter, not hardcoded email
    subject: subject,
    text: message,
  };

  await mg.messages().send(data);
}

// DynamoDB
async function trackEmail(recipientEmail, status) {
  const params = {
    TableName: dynamoDBTableName,
    Item: {
      email: recipientEmail,
      status: status,
      timestamp: new Date().toISOString(),
    },
  };

  return dynamoDB.put(params).promise();
}
