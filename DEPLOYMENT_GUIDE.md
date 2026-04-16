# Dermatics AI — Deployment Guide

Complete step-by-step instructions for deploying the separated frontend (AWS Amplify) and backend (AWS Lambda) with S3 image storage.

---

## Architecture Overview

```
┌─────────────────┐          ┌──────────────────────────┐        ┌───────────┐
│  AWS Amplify    │  HTTPS   │  API Gateway + Lambda    │        │  MongoDB  │
│  (React SPA)    │────────> │  (Express Backend)       │───────>│  Atlas    │
│  Frontend       │          │                          │        └───────────┘
└─────────────────┘          │                          │        ┌───────────┐
                             │                          │───────>│  AWS S3   │
                             └──────────────────────────┘        │  (Images) │
                                       │                         └───────────┘
                                       │                         ┌───────────┐
                                       └────────────────────────>│  Gemini   │
                                                                 │  AI API   │
                                                                 └───────────┘
```

---

## Part 1: AWS S3 Bucket Setup (Image Storage)

### Step 1.1 — Create the S3 Bucket

1. Go to **AWS Console → S3 → Create Bucket**.
2. Bucket name: `dermatics-user-images` (or your preferred name).
3. Region: `ap-south-1` (Mumbai) — or whichever is closest to your users.
4. **Block all public access**: Keep this **ON** (images are stored privately).
5. Click **Create Bucket**.

### Step 1.2 — Create an IAM User for S3 Access

1. Go to **AWS Console → IAM → Users → Create User**.
2. User name: `dermatics-s3-uploader`.
3. Select **Attach policies directly**, then click **Create policy** and use this JSON:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::dermatics-user-images",
                "arn:aws:s3:::dermatics-user-images/*"
            ]
        }
    ]
}
```

4. Name the policy `DermaticsS3UploadPolicy` and attach it to the user.
5. Go to the user → **Security credentials → Create access key → Application running outside AWS**.
6. **Copy the Access Key ID and Secret Access Key** — you'll need these for Lambda.

### Step 1.3 — Configure CORS on the Bucket (Optional — only if frontend directly uploads)

The current architecture uploads via the backend, so CORS is not required. If you later add direct browser uploads via presigned URLs, add a CORS policy under **Bucket → Permissions → CORS**:

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["PUT", "POST", "GET"],
        "AllowedOrigins": ["https://your-amplify-domain.amplifyapp.com"],
        "ExposeHeaders": ["ETag"]
    }
]
```

---

## Part 2: Backend Deployment (AWS Lambda)

### Step 2.1 — Prepare the Backend Code

1. Open the `backend/` folder.
2. Copy `.env.example` to `.env` and fill in all values:
   ```
   GEMINI_API_KEY=your_gemini_key
   MONGO_URI=mongodb+srv://...
   SHOPIFY_DOMAIN=your-store.myshopify.com
   SHOPIFY_ACCESS_TOKEN=your_token
   AWS_S3_BUCKET_NAME=dermatics-user-images
   AWS_S3_REGION=ap-south-1
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=your_secret
   FRONTEND_URL=https://your-app.amplifyapp.com
   ```
3. Install dependencies:
   ```bash
   cd backend
   npm install
   ```
4. Test locally:
   ```bash
   node app.js
   # Server should start on port 5000
   # Test: curl http://localhost:5000/api/health
   ```

### Step 2.2 — Create a Lambda Deployment Package

**Option A: ZIP Deploy (Simple)**

```bash
cd backend

# Install production dependencies only
npm install --production

# Create the ZIP (include node_modules)
zip -r dermatics-backend.zip . -x ".env" "*.git*" ".serverless/*"
```

**Option B: Using AWS SAM (Recommended for larger projects)**

Create a `template.yaml` in the backend folder:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Dermatics AI Backend

Globals:
  Function:
    Timeout: 120
    MemorySize: 1024
    Runtime: nodejs20.x

Resources:
  DermaticsApi:
    Type: AWS::Serverless::Function
    Properties:
      Handler: app.handler
      CodeUri: .
      Events:
        ProxyApi:
          Type: Api
          Properties:
            Path: /{proxy+}
            Method: ANY
        RootApi:
          Type: Api
          Properties:
            Path: /
            Method: ANY
      Environment:
        Variables:
          GEMINI_API_KEY: !Ref GeminiApiKey
          MONGO_URI: !Ref MongoUri
          SHOPIFY_DOMAIN: !Ref ShopifyDomain
          SHOPIFY_ACCESS_TOKEN: !Ref ShopifyAccessToken
          AWS_S3_BUCKET_NAME: !Ref S3BucketName
          FRONTEND_URL: !Ref FrontendUrl

Parameters:
  GeminiApiKey:
    Type: String
    NoEcho: true
  MongoUri:
    Type: String
    NoEcho: true
  ShopifyDomain:
    Type: String
  ShopifyAccessToken:
    Type: String
    NoEcho: true
  S3BucketName:
    Type: String
  FrontendUrl:
    Type: String

Outputs:
  ApiUrl:
    Value: !Sub "https://${ServerlessRestApi}.execute-api.${AWS::Region}.amazonaws.com/Prod"
```

Then deploy:

```bash
sam build
sam deploy --guided
```

### Step 2.3 — Lambda Console Deploy (Manual ZIP)

1. Go to **AWS Console → Lambda → Create Function**.
2. Function name: `dermatics-backend`.
3. Runtime: **Node.js 20.x**.
4. Architecture: **x86_64**.
5. Click **Create Function**.
6. Under **Code**, click **Upload from → .zip file** and upload `dermatics-backend.zip`.
7. Set the **Handler** to: `app.handler`.
8. Under **Configuration → General**, set:
   - **Timeout**: 2 minutes (120 seconds) — AI calls can take time.
   - **Memory**: 1024 MB minimum.
9. Under **Configuration → Environment variables**, add ALL variables from your `.env` file:
   - `GEMINI_API_KEY`
   - `MONGO_URI`
   - `SHOPIFY_DOMAIN`
   - `SHOPIFY_ACCESS_TOKEN`
   - `AWS_S3_BUCKET_NAME`
   - `AWS_S3_REGION`
   - `FRONTEND_URL`
   
   **Note:** For Lambda, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are not needed if you attach an IAM role. Instead:
   
10. Under **Configuration → Permissions**, click the execution role.
11. Attach the `DermaticsS3UploadPolicy` created in Part 1 to this role.

### Step 2.4 — Create API Gateway

1. Go to **AWS Console → API Gateway → Create API → REST API**.
2. API name: `dermatics-api`.
3. Create a **proxy resource**:
   - Resource path: `/{proxy+}`
   - Enable **Lambda Proxy integration**.
   - Lambda function: `dermatics-backend`.
4. Also create a root `ANY` method pointing to the same Lambda.
5. Under **Actions → Deploy API**:
   - Stage name: `prod`.
6. **Copy the Invoke URL** — this is your backend URL:
   ```
   https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod
   ```

### Step 2.5 — Enable CORS on API Gateway

1. Select the `/{proxy+}` resource.
2. Click **Actions → Enable CORS**.
3. Access-Control-Allow-Origin: `https://your-app.amplifyapp.com`
4. Access-Control-Allow-Headers: `Content-Type,Authorization,X-Refresh-Secret`
5. Access-Control-Allow-Methods: `GET,POST,OPTIONS`
6. Click **Enable CORS and replace existing CORS headers**.
7. **Redeploy the API** (Actions → Deploy API → prod).

**Note:** The backend also handles CORS via Express middleware, but API Gateway CORS is needed for OPTIONS preflight requests.

### Step 2.6 — Increase API Gateway Payload Limit

By default, API Gateway has a 10 MB payload limit, which is fine for base64 images. However, ensure:

1. Go to API Gateway → Settings → Binary Media Types.
2. Ensure `*/*` is NOT listed (we use JSON, not binary passthrough).
3. The API Gateway default 10 MB limit should suffice. If you send more than 4 images at once, consider increasing it or compressing images on the frontend.

---

## Part 3: Frontend Deployment (AWS Amplify)

### Step 3.1 — Prepare the Frontend

1. Open the `frontend/` folder.
2. Create a `.env` file:
   ```
   VITE_API_URL=https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod
   ```
   Replace with your actual API Gateway URL from Step 2.4.
3. Test locally:
   ```bash
   cd frontend
   npm install
   npm run dev
   # Should open on http://localhost:3000
   ```

### Step 3.2 — Push to Git Repository

Amplify deploys from a Git repository (GitHub, GitLab, Bitbucket, or CodeCommit).

1. Create a new Git repo for the frontend:
   ```bash
   cd frontend
   git init
   git add .
   git commit -m "Initial frontend commit"
   git remote add origin https://github.com/your-org/dermatics-frontend.git
   git push -u origin main
   ```

### Step 3.3 — Create Amplify App

1. Go to **AWS Console → AWS Amplify → Create new app → Host web app**.
2. Connect your Git provider and select the `dermatics-frontend` repository.
3. Branch: `main`.
4. Amplify will auto-detect the `amplify.yml` build spec included in the project.
5. Under **Advanced settings → Environment variables**, add:
   ```
   VITE_API_URL = https://abc123xyz.execute-api.ap-south-1.amazonaws.com/prod
   ```
6. Click **Save and deploy**.

### Step 3.4 — Configure SPA Rewrites

After deployment, set up rewrite rules for client-side routing:

1. Go to **Amplify → App settings → Rewrites and redirects**.
2. Add this rule:
   - Source: `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>`
   - Target: `/index.html`
   - Type: `200 (Rewrite)`

This ensures all non-file routes serve `index.html` for the React SPA.

### Step 3.5 — Custom Domain (Optional)

1. Go to **Amplify → App settings → Domain management → Add domain**.
2. Enter your domain (e.g., `app.dermatics.in`).
3. Follow Amplify's DNS instructions to configure your registrar.
4. Amplify automatically provisions an SSL certificate.
5. **Update `FRONTEND_URL` in Lambda** to match your custom domain.

---

## Part 4: Post-Deployment Verification

### 4.1 — Test the Backend

```bash
# Health check
curl https://YOUR_API_URL/prod/api/health

# Expected response:
# {"status":"success","message":"AI Server is awake and running!"}
```

### 4.2 — Test S3 Upload

```bash
# Create a tiny test image (1x1 pixel red PNG as base64)
curl -X POST https://YOUR_API_URL/prod/api/upload-images \
  -H "Content-Type: application/json" \
  -d '{"images":["iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="]}'

# Expected: {"status":"success","images":[{"originalName":"capture-...","s3Key":"uploads/analysis/...","mimeType":"image/jpeg","size":...}]}
```

### 4.3 — Test Frontend

1. Open your Amplify URL (e.g., `https://main.d1234abcd.amplifyapp.com`).
2. The app should load and all API calls should hit your Lambda backend.
3. Open browser DevTools → Network tab to verify API calls go to your API Gateway URL.

### 4.4 — Verify MongoDB Image Storage

After running an analysis through the app, check MongoDB Atlas:

1. Go to your Atlas cluster → **Browse Collections**.
2. Find your user document.
3. Verify the `history[].images` array contains entries like:
   ```json
   {
       "_id": "...",
       "originalName": "capture-1776230573153.jpg",
       "s3Key": "uploads/analysis/1776230574356-ce1a70ac432d6f85dc72576da9276279.jpg",
       "mimeType": "image/jpeg",
       "size": 64070,
       "context": "analysis-input",
       "createdAt": "2026-04-15T05:22:54.997+00:00"
   }
   ```

---

## Part 5: Environment Variables Reference

### Backend (Lambda)

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Gemini AI API key(s), comma-separated for failover |
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `SHOPIFY_DOMAIN` | Yes | Shopify store domain |
| `SHOPIFY_ACCESS_TOKEN` | Yes | Shopify Storefront Access Token |
| `AWS_S3_BUCKET_NAME` | Yes | S3 bucket name for image uploads |
| `AWS_S3_REGION` | Yes | S3 bucket region (e.g., `ap-south-1`) |
| `FRONTEND_URL` | Yes | Amplify frontend URL for CORS |
| `REDIS_URL` | No | Redis URL for catalog caching (falls back to in-memory) |
| `INTERNAL_REFRESH_SECRET` | No | Secret for manual catalog refresh endpoint |

**Note:** When running on Lambda with an IAM role that has S3 permissions, you do **not** need `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` — Lambda uses the role's credentials automatically. Only set these for local development.

### Frontend (Amplify)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend API Gateway URL (e.g., `https://xxx.execute-api.ap-south-1.amazonaws.com/prod`) |

---

## Troubleshooting

### "CORS error" in browser console
- Ensure `FRONTEND_URL` in Lambda env matches your Amplify URL exactly (including `https://`).
- Redeploy API Gateway after enabling CORS.
- Check that API Gateway has OPTIONS method enabled.

### Lambda timeout errors
- Increase Lambda timeout to 120 seconds (AI analysis can take 30-60 seconds).
- Increase memory to 1024+ MB.

### Images not saving to S3
- Verify the Lambda execution role has `DermaticsS3UploadPolicy` attached.
- Check CloudWatch logs for S3 upload errors.
- Verify bucket name matches `AWS_S3_BUCKET_NAME`.

### Frontend shows blank page on Amplify
- Ensure SPA rewrite rule is configured (Step 3.4).
- Check that `index.html` is in the build output.
- Verify `VITE_API_URL` is set in Amplify environment variables.

### MongoDB connection fails on Lambda
- Whitelist `0.0.0.0/0` in MongoDB Atlas Network Access (or use AWS PrivateLink).
- Lambda IPs change, so specific IP whitelisting won't work without a VPC + NAT Gateway.

---

## Security Recommendations

1. **MongoDB Atlas**: Use a dedicated database user with minimal permissions (readWrite on your database only).
2. **API Keys**: Store all secrets in Lambda environment variables (encrypted at rest by default).
3. **S3 Bucket**: Keep public access blocked. Only access images through your backend.
4. **API Gateway**: Consider adding a usage plan and API key for rate limiting.
5. **CORS**: Restrict `FRONTEND_URL` to your exact domain — never use `*` in production.
6. **Lambda**: Use the latest Node.js runtime and keep dependencies updated.
