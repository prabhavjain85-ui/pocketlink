FROM condaforge/mambaforge:24.7.2-0

WORKDIR /app

COPY services/docking/environment.yml /tmp/environment.yml
RUN mamba env update -n base -f /tmp/environment.yml --yes && mamba clean -a -y

COPY benchmark/docking/engine.config.json /app/benchmark/docking/engine.config.json
COPY services/docking/app /app/app

ENV ENGINE_CONFIG_PATH=/app/benchmark/docking/engine.config.json
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
