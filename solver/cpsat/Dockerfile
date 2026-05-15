FROM python:3.12-slim

WORKDIR /app

COPY solver/cpsat/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY solver/cpsat/service.py /app/service.py

ENV HOST=0.0.0.0
EXPOSE 8790

CMD ["python", "/app/service.py"]
