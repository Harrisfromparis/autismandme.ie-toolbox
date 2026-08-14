FROM python:3.12-slim

ARG OPENTUTOR_COMMIT=47c23db3785ff8cb5e84a50968f16373074dc819
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && git clone https://github.com/zijinz456/OpenTutor.git /opt/opentutor \
    && git -C /opt/opentutor checkout "$OPENTUTOR_COMMIT" \
    && rm -rf /var/lib/apt/lists/* /opt/opentutor/.git

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./
COPY content ./content
ENV OPENTUTOR_API=/opt/opentutor/apps/api
ENV ILEARN_CONTENT_FILE=/app/content/macbeth_act1_scene7_excerpt.md
ENV ILEARN_SAG_DATA_DIR=/data/sag
EXPOSE 8008
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8008", "--proxy-headers"]
