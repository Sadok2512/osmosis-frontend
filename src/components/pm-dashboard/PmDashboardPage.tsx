import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SpecificDimensionsSection } from "@/components/pm-dashboard/SpecificDimensionsSection";
import { Database } from "lucide-react";

const PmDashboardPage = () => {
  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">PM Dashboard</h1>
            <p className="text-sm text-muted-foreground">Nokia Performance Management — Counter Explorer & Dimensions</p>
          </div>
        </div>

        <Tabs defaultValue="specific">
          <TabsList>
            <TabsTrigger value="standard">Standard Counters</TabsTrigger>
            <TabsTrigger value="specific">
              Specific Dimensions
              <Badge variant="secondary" className="ml-1 text-xs">Advanced</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="standard">
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Database className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold mb-1">Standard Counters</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Standard PM counter explorer is available on the backend admin panel.
                Use the Specific Dimensions tab for advanced multi-dimensional analysis.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="specific">
            <SpecificDimensionsSection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PmDashboardPage;
