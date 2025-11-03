import boto3
from botocore.exceptions import BotoCoreError, NoCredentialsError

from os import getenv
from dotenv import load_dotenv
load_dotenv()


def upload_qr_to_s3(buffer, filename):
    """
    Upload a QR code PNG buffer to S3 and return the public URL.
    """
    try:
        s3 = boto3.client(
            "s3",
            aws_access_key_id=getenv("AWS_ACCESS_KEY_ID"),
            aws_secret_access_key=getenv("AWS_SECRET_ACCESS_KEY"),
            region_name=getenv("AWS_REGION", "sa-east-1"),
        )
        bucket_name = getenv("AWS_S3_BUCKET_NAME")

        file_name_with_ext = f"{filename}.png" 
        key = f"qr-codes/{file_name_with_ext}"

        s3.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=buffer,
            ContentType="image/png",
            # Pass ContentDisposition as a top-level argument
            ContentDisposition=f'attachment; filename="{file_name_with_ext}"'
        )

        # Return the URL
        return f"https://{bucket_name}.s3.{getenv('AWS_REGION', 'sa-east-1')}.amazonaws.com/{key}"

    except (BotoCoreError, NoCredentialsError, Exception) as e:
        print(f"🚨 Error uploading QR to S3: {e}")
        return None
