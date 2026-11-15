import contextlib
import os
import subprocess
import tempfile


@contextlib.contextmanager
def checkout(repo, ref):
    """A temporary detached worktree of repo at ref."""
    with tempfile.TemporaryDirectory() as tmp:
        wt = os.path.join(tmp, "wt")
        subprocess.run(["git", "-C", repo, "worktree", "add", "-q", "--detach", wt, ref], check=True)
        try:
            yield wt
        finally:
            subprocess.run(["git", "-C", repo, "worktree", "remove", "--force", wt], check=True)


def show(repo, ref, path):
    return subprocess.run(["git", "-C", repo, "show", f"{ref}:{path}"], check=True,
                          capture_output=True, text=True).stdout
