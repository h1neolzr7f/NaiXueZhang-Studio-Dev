"""Experience projection layer for D-020.

This package is a presentation/control surface over existing authoritative
state. It is not a second workflow engine, permission system, or job store.
"""

from .character_state import character_state_for_events, map_event_to_character_state
from .conversation import assert_conversation_workflow_split
from .events import EVENT_TYPES, ExperienceEvent, make_event
from .handoff_product import consume_product_handoff, create_product_handoff
from .manifests import AgentManifest, list_manifests, load_manifest
from .memory import AUTHORITATIVE_SCOPES, list_layered_memories, propose_layered_memory
from .proactive import PROACTIVE_MODES, classify_proactive
from .projector import ExperienceSnapshot, project_snapshot

__all__ = [
    "AUTHORITATIVE_SCOPES",
    "AgentManifest",
    "EVENT_TYPES",
    "ExperienceEvent",
    "ExperienceSnapshot",
    "PROACTIVE_MODES",
    "assert_conversation_workflow_split",
    "character_state_for_events",
    "classify_proactive",
    "consume_product_handoff",
    "create_product_handoff",
    "list_layered_memories",
    "list_manifests",
    "load_manifest",
    "make_event",
    "map_event_to_character_state",
    "project_snapshot",
    "propose_layered_memory",
]
