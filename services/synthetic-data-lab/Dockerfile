FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY synthetic_lab ./synthetic_lab
RUN useradd --create-home lab
USER lab
ENV PYTHONUNBUFFERED=1
EXPOSE 8765
CMD ["python", "-m", "uvicorn", "synthetic_lab.app:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "1"]
