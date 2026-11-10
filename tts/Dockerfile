# Voz neural em português (Piper, roda na CPU). A voz é baixada no build.
FROM python:3.12-slim
RUN pip install --no-cache-dir "piper-tts[http,alignment]==1.8.0"
ARG VOICE=pt_BR-faber-medium
ENV VOICE=${VOICE}
WORKDIR /voices
RUN python -m piper.download_voices --data-dir /voices "${VOICE}"
EXPOSE 5000
HEALTHCHECK --interval=20s --timeout=5s --retries=5 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/voices')" || exit 1
CMD python -m piper.http_server --host 0.0.0.0 --port 5000 --data-dir /voices -m "${VOICE}"
