FROM python:3.12-slim
WORKDIR /repo
COPY pipeline/requirements.txt pipeline/requirements.txt
RUN pip install --no-cache-dir -r pipeline/requirements.txt
COPY pipeline/ pipeline/
# seed_db.py imports the ORM models straight from backend/src (sys.path trick keyed on
# pipeline/ and backend/ being siblings), so this image needs backend/src alongside
# pipeline/ even though the build context is the whole repo, not just ./pipeline.
COPY backend/src/ backend/src/
WORKDIR /repo/pipeline
ENTRYPOINT ["python"]
