# 🔗 InstaLink

A simple and modern file-sharing service that allows you to upload any file and get a permanent, shareable link instantly. Perfect for sharing resumes, portfolios, or any document without worrying about broken links.

## ✨ Features

  * **Clean User Interface:** A modern, responsive UI built with Tailwind CSS.
  * **Drag & Drop:** Easily drag and drop files to upload.
  * **Custom Links:** Create memorable, custom names for your shareable links (e.g., `/file/my-resume`).
  * **Unique ID Generation:** Automatically generates a unique, short ID if no custom name is provided.
  * **Cloud Storage:** Files are stored securely and served efficiently from the cloud via Cloudinary.
  * **Direct Downloads:** The generated link redirects to an automatic file download.

-----

## 🛠️ Tech Stack

  * **Backend:** Node.js, Express.js
  * **Database:** MongoDB with Mongoose
  * **File Handling:** Multer for processing uploads
  * **Cloud Storage:** Cloudinary for robust file storage and delivery
  * **Frontend:** HTML, Tailwind CSS, Vanilla JavaScript

-----

## 🚀 Getting Started

Follow these instructions to get a local copy of the project up and running.

### Prerequisites

You will need the following installed on your machine:

  * Node.js & npm (or yarn)
  * A free MongoDB Atlas account (or a local MongoDB server)
  * A free Cloudinary account

### Installation & Setup

1.  **Clone the repository:**

    ```sh
    git clone https://github.com/spoorthitechie28/instalink.git
    cd instalink
    ```

2.  **Install dependencies:**

    ```sh
    npm install
    ```

### Environment Variables

Create a file named `.env` in the root of your project and add the following configuration. Replace the placeholder values with your actual credentials from MongoDB and Cloudinary.

```env
# Server Port
PORT=3000

# MongoDB Connection String
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/<database>?retryWrites=true&w=majority

# Cloudinary Credentials
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Optional: For production deployment (e.g., on Render)
# RENDER_EXTERNAL_URL=https://your-app-name.onrender.com
```

### Running the Application

Start the development server with:

```sh
npm start
```

The application should now be running at `http://localhost:3000`.

-----

## 📦 API Endpoints

The application exposes two main API endpoints:

### **`POST /upload`**

Uploads a file and generates a shareable link.

  * **Request Type:** `multipart/form-data`
  * **Form Fields:**
      * `file`: The file to be uploaded (required).
      * `customName`: A string for the custom link name (optional).
  * **Success Response (200):**
    ```json
    {
      "link": "http://localhost:3000/file/your-custom-name"
    }
    ```
  * **Error Response (4xx/5xx):**
    ```json
    {
      "error": "Error message describing the issue."
    }
    ```

### **`GET /file/:shortId`**

Redirects to the direct download link for the file associated with the `shortId`.

  * **URL Parameter:**
      * `shortId`: The unique or custom ID of the file.
  * **Behavior:**
      * If the file is found, the server responds with a `302 Found` redirect to the Cloudinary download URL.
      * If the file is not found, it responds with a `404 Not Found` error.
