#!/usr/bin/env node
/**
 * Prints AWS CLI steps to deploy CP-SAT Lambda (container image).
 * Usage: node scripts/aws/deploy-cpsat-lambda.mjs [AWS_REGION] [AWS_ACCOUNT_ID]
 */
const region = process.argv[2] || process.env.AWS_REGION || "us-east-1";
const account = process.argv[3] || process.env.AWS_ACCOUNT_ID || "YOUR_ACCOUNT_ID";
const repo = "schooltime-cpsat-lambda";
const fn = "schooltime-cpsat-lambda";
const image = `${account}.dkr.ecr.${region}.amazonaws.com/${repo}:latest`;

const steps = `
SchoolTime CP-SAT Lambda deploy checklist
=========================================
Region: ${region}
Account: ${account}

1) Build image (repo root):
   docker build -f solver/cpsat/Dockerfile.lambda -t ${repo} .

2) ECR:
   aws ecr create-repository --repository-name ${repo} --region ${region}
   aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${account}.dkr.ecr.${region}.amazonaws.com
   docker tag ${repo}:latest ${image}
   docker push ${image}

3) Lambda (first time):
   aws lambda create-function --function-name ${fn} --package-type Image \\
     --code ImageUri=${image} --role arn:aws:iam::${account}:role/YOUR_LAMBDA_EXECUTION_ROLE \\
     --timeout 300 --memory-size 2048 \\
     --environment Variables={CP_SAT_SOLVER_SECRET=YOUR_SECRET} \\
     --region ${region}

4) Function URL:
   aws lambda create-function-url-config --function-name ${fn} --auth-type NONE --region ${region}
   aws lambda add-permission --function-name ${fn} --statement-id FunctionURLAllowPublic \\
     --action lambda:InvokeFunctionUrl --principal "*" --function-url-auth-type NONE --region ${region}

5) On EC2 API .env:
   CP_SAT_SOLVER_URL=https://<function-url-id>.lambda-url.${region}.on.aws/solve
   CP_SAT_SOLVER_SECRET=YOUR_SECRET
   TIMETABLE_SOLVER_TIMEOUT_MS=120000

Docs: docs/AWS_LAMBDA_CPSAT.md
`;

console.log(steps);
