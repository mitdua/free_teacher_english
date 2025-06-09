# Use a Python image with uv pre-installed
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim


WORKDIR /src


# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy from the cache instead of linking since it's a mounted volume
ENV UV_LINK_MODE=copy

# Install the project's dependencies using the lockfile and settings
RUN --mount=type=cache,target=/src/.cache/uv \
    --mount=type=bind,source=./uv.lock,target=/src/uv.lock \
    --mount=type=bind,source=./pyproject.toml,target=/src/pyproject.toml \
    uv sync --frozen --no-install-project --no-dev


# Then, add the rest of the project source code and install it
# Installing separately from its dependencies allows optimal layer caching

COPY /src/ /src/src/
# Place executables in the environment at the front of the path
ENV PATH="/src/.venv/bin:$PATH"

