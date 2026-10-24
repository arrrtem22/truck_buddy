from typing import List, Literal, Optional

from pydantic import BaseModel, Field

Category = Literal["truck_stop", "hotel", "rest_area"]


class LatLng(BaseModel):
    lat: float
    lng: float


class Place(BaseModel):
    id: str
    name: str
    category: Category
    lat: float
    lng: float
    tags: List[str] = Field(default_factory=list)
    address: Optional[str] = None
    distance_km: Optional[float] = None
    distance_mi: Optional[float] = None


class PlacesResponse(BaseModel):
    category: Category
    radius_km: float
    widened: bool
    places: List[Place]
    source: str


class RouteInfo(BaseModel):
    geometry: List[List[float]]  # [[lat, lng], ...]
    distance_m: float
    duration_s: float
    distance_mi: float
    duration_min: int
    summary: str  # "12 min · 6.2 mi"
    source: str


class RouteRequest(BaseModel):
    lat: float
    lng: float
    place_id: str


class RouteResponse(BaseModel):
    place: Place
    route: RouteInfo


class TruckProfile(BaseModel):
    height: str = "13 ft 6 in"
    trailer_length: str = "53 ft trailer"


class AgentRequest(BaseModel):
    text: str
    lat: float
    lng: float
    truck_profile: TruckProfile = Field(default_factory=TruckProfile)


AgentStatus = Literal["route_set", "no_results", "not_understood"]


class AgentResponse(BaseModel):
    status: AgentStatus
    transcript: str
    category: Optional[Category] = None
    reply: str
    message: Optional[str] = None  # UI message for non-success statuses
    place: Optional[Place] = None
    route: Optional[RouteInfo] = None
    source: str
