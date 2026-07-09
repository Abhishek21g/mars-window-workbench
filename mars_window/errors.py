class MarsWindowError(Exception):
    """Base error."""


class ManifestError(MarsWindowError):
    """Invalid manifest or window file."""


class ScenarioError(MarsWindowError):
    """Invalid scenario inputs."""
