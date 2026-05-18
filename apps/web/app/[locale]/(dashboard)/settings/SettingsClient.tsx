"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

export function SettingsClient({ token }: { token: string }) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState("")

  async function handleDelete() {
    setDeleting(true)
    setError("")
    try {
      const res = await fetch(`${BASE}/api/auth/me`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error("Failed")
      await signOut({ callbackUrl: "/" })
    } catch {
      setError("Failed to delete account. Please try again.")
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data &amp; Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              Download a copy of all personal data stored in PayFlow (GDPR / LATAM data portability).
            </p>
            <a href={`${BASE}/api/auth/me/export`} download>
              <Button variant="outline" size="sm">Export my data</Button>
            </a>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground mb-2">
              Permanently delete your account. Payment records are retained for legal compliance but your personal information is removed.
            </p>
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              Delete account
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes your personal information permanently. Payment records are kept for legal compliance. This cannot be undone.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={handleDelete}>
              {deleting ? "Deleting…" : "Yes, delete my account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
