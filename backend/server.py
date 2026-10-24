import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from models import AgentRequest, AgentResponse, Category, PlacesResponse, RouteRequest, RouteResponse  # noqa: E402
from services.agent import get_agent_provider  # noqa: E402
from services.places import get_places_provider  # noqa: E402
from services.routing import get_routing_provider  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("truckbuddy")

app = FastAPI(
    title="TruckBuddy API",
    version="0.1.0",
    description="Voice copilot for truckers. Phase 1 MVP: places, routing and agent are MOCK providers.",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url=None,
)
api = APIRouter(prefix="/api")


@api.get("/health")
async def health():
    return {
        "ok": True,
        "providers": {
            "places": get_places_provider().source,
            "routing": get_routing_provider().source,
            "agent": get_agent_provider().source,
        },
    }


@api.get("/places", response_model=PlacesResponse)
async def search_places(
    category: Category = Query(...),
    lat: float = Query(38.5816, ge=-90, le=90),
    lng: float = Query(-121.4944, ge=-180, le=180),
):
    return await get_places_provider().search(category, lat, lng)


@api.post("/route", response_model=RouteResponse)
async def build_route(req: RouteRequest):
    place = await get_places_provider().get(req.place_id, req.lat, req.lng)
    if place is None:
        raise HTTPException(status_code=404, detail="Place not found")
    route = await get_routing_provider().route(req.lat, req.lng, place.lat, place.lng)
    return RouteResponse(place=place, route=route)


@api.post("/agent", response_model=AgentResponse)
async def agent(req: AgentRequest):
    res = await get_agent_provider().handle(req)
    logger.info("agent text=%r status=%s place=%s", req.text, res.status, res.place.name if res.place else None)
    return res


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
