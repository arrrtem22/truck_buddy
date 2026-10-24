"""Copilot agent. MOCK implementation: keyword intent -> closest place -> route.

Real implementation to plug in later: Whisper (STT) -> GPT 5.5 with tools
search_places / set_route -> OpenAI TTS. Keep the same `handle()` signature.
"""
import re
from typing import Optional, Protocol

from models import AgentRequest, AgentResponse, Category, Place
from services.places import get_places_provider
from services.routing import get_routing_provider

NOT_UNDERSTOOD = "Sorry, I didn't catch that. Try again."
NO_PLACES = "No places found nearby"

KEYWORDS = {
    "truck_stop": ["truck stop", "truckstop", "fuel", "diesel", "gas", "shower", "food", "eat", "travel center", "def"],
    "rest_area": ["rest area", "rest stop", "break", "nap", "stretch", "restroom", "bathroom", "toilet", "rest"],
    "hotel": ["hotel", "motel", "sleep", "tired", "bed", "room", "night", "overnight", "inn", "lodge"],
}
LABELS = {"truck_stop": "truck stop", "hotel": "hotel", "rest_area": "rest area"}


class AgentProvider(Protocol):
    source: str

    async def handle(self, req: AgentRequest) -> AgentResponse: ...


def detect_category(text: str) -> Category:
    t = text.lower()
    # Earliest keyword match wins, so "a hotel near a truck stop" -> hotel.
    best: Optional[tuple] = None
    for cat, words in KEYWORDS.items():
        for w in words:
            m = re.search(rf"\b{re.escape(w)}", t)
            if m and (best is None or m.start() < best[0]):
                best = (m.start(), cat)
    return best[1] if best else "hotel"  # default: hotel


def pick_best(places: list[Place], category: Category) -> Place:
    if category == "hotel":
        truck_friendly = [p for p in places if any("truck" in tag.lower() or "53 ft" in tag for tag in p.tags)]
        if truck_friendly:
            return truck_friendly[0]
    return places[0]


class MockAgentProvider:
    source = "mock"

    async def handle(self, req: AgentRequest) -> AgentResponse:
        text = (req.text or "").strip()
        if not re.search(r"[a-zA-Z]{2,}", text):
            return AgentResponse(status="not_understood", transcript=text, reply=NOT_UNDERSTOOD,
                                 message=NOT_UNDERSTOOD, source=self.source)

        category = detect_category(text)
        result = await get_places_provider().search(category, req.lat, req.lng)
        if not result.places:
            reply = f"I couldn't find a {LABELS[category]} nearby, even after widening the search."
            return AgentResponse(status="no_results", transcript=text, category=category, reply=reply,
                                 message=NO_PLACES, source=self.source)

        place = pick_best(result.places, category)
        route = await get_routing_provider().route(req.lat, req.lng, place.lat, place.lng)
        perk = " with truck parking" if any("parking" in t.lower() for t in place.tags) else ""
        reply = (f"I found {place.name}{perk}, {route.distance_mi:.1f} miles away. "
                 f"Route is set, about {route.duration_min} minutes.")
        return AgentResponse(status="route_set", transcript=text, category=category, reply=reply,
                             place=place, route=route, source=self.source)


_provider: AgentProvider = MockAgentProvider()


def get_agent_provider() -> AgentProvider:
    return _provider
