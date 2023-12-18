# Serverless Readme

This Node.js application is designed to handle the download of submission releases and send corresponding email notifications. It is built to work with AWS Lambda, and it utilizes various cloud services such as Google Cloud Storage (GCS) and Mailgun.

## Prerequisites

Before deploying and using this service, make sure you have the following prerequisites:

- Node.js and npm installed
- AWS Lambda environment set up
- Google Cloud Storage bucket created
- Mailgun account and API key
- DynamoDB table for tracking email status

## Setup

1. **Install dependencies:**

```bash javascript
   npm install
```
2. **Configure environment variables:**

    Create a .env file and set the following variables:

    env
    ```
    MAIL_GUN_API_KEY=your_mailgun_api_key
    GCP_PRIVATE_KEY=your_base64_encoded_gcp_private_key
    GCS_BUCKET_NAME=your_gcs_bucket_name
    ```
3. **Deploy the AWS Lambda function**

    **AWS Lambda Function**
    The main logic is implemented in the handler function within the index.js file. This function is triggered by an SNS (Simple Notification Service) event and performs the following actions:

    - Downloads the submission release from a provided URL.
    - Uploads the release to Google Cloud Storage.
    - Generates a signed URL for the uploaded object.
    - Sends a success email with download details.
    - Tracks the email status in DynamoDB.
    - If any step fails, the service sends a failure email and tracks the error in DynamoDB.

4. **Google Cloud Storage**
    The uploadToGCS function handles the upload of submission releases to Google Cloud Storage. It uses the @google-cloud/storage library to interact with GCS.

5. **Mailgun**
    The sendSuccessEmail and sendFailureEmail functions use the Mailgun API to send success and failure email notifications, respectively.

6. **DynamoDB**
    The trackEmail function records email status in a DynamoDB table named Csye6225_Demo_DynamoDB. The table stores information such as the email timestamp, recipient email address, and status.

7. **Additional Notes**
    Make sure to secure sensitive information like API keys and private keys.
    Adjust the error handling and logging based on your requirements.
    Test the Lambda function thoroughly before deploying it to a production environment.
    Feel free to customize this code to fit your specific use case and requirements.
