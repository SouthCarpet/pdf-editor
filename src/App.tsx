import { Button } from "@/components/ui/button";

export default function App() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">PDF Editor</h1>
      <Button className="mt-4" onClick={() => alert("ok")}>
        Click me
      </Button>
    </div>
  );
}
