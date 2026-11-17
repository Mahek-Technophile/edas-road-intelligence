from __future__ import annotations

import os
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes import router
from app.api.vision_routes import router as vision_router
from app.core.errors import ApiError, error_body


app = FastAPI(title="EDAS API", version="2.0.0")
cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "EDAS_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)
app.include_router(router)
app.include_router(vision_router)


@app.middleware("http")
async def correlation_id(request: Request, call_next):
    request_id = str(uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError):
    request_id = getattr(request.state, "request_id", str(uuid4()))
    return JSONResponse(status_code=exc.status_code, content=error_body(request_id, exc),
                        headers={"X-Request-ID": request_id})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    details = []
    status_code = 422
    for error in exc.errors():
        location = error.get("loc", ())
        field_parts = [str(item) for item in location if item not in {"body", "query", "path"}]
        details.append({"field": ".".join(field_parts) or "request", "issue": "invalid value"})
        if location and location[0] == "body":
            field = str(location[-1]) if len(location) > 1 else ""
            status_code = 422 if field in {"latitude", "longitude", "reason", "resolution_note"} else 400
    request_id = getattr(request.state, "request_id", str(uuid4()))
    error = ApiError(status_code, "invalid_request", "One or more fields are invalid.", details)
    return JSONResponse(status_code=status_code, content=error_body(request_id, error),
                        headers={"X-Request-ID": request_id})


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException):
    request_id = getattr(request.state, "request_id", str(uuid4()))
    code = "not_found" if exc.status_code == 404 else "invalid_request"
    message = "The requested resource was not found." if exc.status_code == 404 else "The request could not be completed."
    error = ApiError(exc.status_code, code, message)
    return JSONResponse(status_code=exc.status_code, content=error_body(request_id, error),
                        headers={"X-Request-ID": request_id})


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, _exc: Exception):
    request_id = getattr(request.state, "request_id", str(uuid4()))
    error = ApiError(500, "internal_error", "An internal error occurred.")
    return JSONResponse(status_code=500, content=error_body(request_id, error),
                        headers={"X-Request-ID": request_id})
