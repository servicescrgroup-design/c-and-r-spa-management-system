import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ComingSoon({ title, phase, description }: { title: string; phase: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Coming in {phase}</CardTitle>
          <CardDescription>
            This screen is scaffolded and route-gated, and will be built out in
            that phase of the project plan.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
