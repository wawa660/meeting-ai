"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import {
  Mic,
  Play,
  Pause,
  Square,
  Settings,
  Download,
  Share2,
  CheckCircle2,
  Circle,
  Clock,
  Users,
  Brain,
  FileText,
  Zap,
  BookOpen,
  ExternalLink,
  Loader2,
  Moon,
  Sun,
} from "lucide-react"
import { useTheme } from "next-themes"

interface TranscriptEntry {
  id: string
  speaker: string
  text: string
  timestamp: string
  confidence: number
}

interface Task {
  id: string
  title: string
  assignee: string
  priority: "high" | "medium" | "low"
  completed: boolean
  dueDate?: string
}

// NOTE: The 'Summary' interface below is for a more structured AI output.
// Your current backend provides a simple string summary.
// For now, the 'summary' state will be a string to match backend output.
// If you intend for the AI to return structured data for keyPoints, decisions, etc.,
// your backend's AI model would need to be updated to provide that.
// interface Summary {
//   keyPoints: string[]
//   decisions: string[]
//   nextSteps: string[]
//   participants: string[]
// }

// Extend the Window interface to include electronAPI
declare global {
  interface Window {
    electronAPI: {
      minimize: () => void
      maximize: () => void
      close: () => void
      startTranscriptCapture: () => Promise<{ success: boolean }>
      stopTranscriptCapture: () => Promise<{ success: boolean }>
      sendAudioForAnalysis: (arrayBuffer: ArrayBuffer) => Promise<{ success: boolean; summary?: string; action_items?: any[]; transcript?: string; error?: string }>;
      processAISummary: (transcript: string) => Promise<{ success: boolean; summary?: string; action_items?: any[]; transcript?: string; error?: string }>;
      exportToNotion: (config: { apiKey: string; databaseId: string; pageTitle?: string; }, data: { summary: string; tasks: Task[]; transcript: string; meetingDuration?: string; participants?: string[] }) => Promise<{ success: boolean; pageId?: string; error?: string }>;
      fetchNotionDatabases: (apiKey: string) => Promise<{ success: boolean; databases?: { id: string; title: string }[]; error?: string }>;
      onTranscriptUpdate: (callback: (event: Electron.IpcRendererEvent, transcript: TranscriptEntry[]) => void) => void;
      onMeetingStatusChange: (callback: (event: Electron.IpcRendererEvent, status: string) => void) => void;
    }
  }
}

export default function MeetingTranscriptApp() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  // Adjusted 'summary' state to be string to match current backend output
  const [summary, setSummary] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [isProcessing, setIsProcessing] = useState(false) // Renamed from isLoadingAnalysis for consistency with your code
  const [meetingDuration, setMeetingDuration] = useState(0)
  const [activeTab, setActiveTab] = useState("transcript")
  const scrollRef = useRef<HTMLDivElement>(null)

  const [isNotionDialogOpen, setIsNotionDialogOpen] = useState(false)
  const [notionConfig, setNotionConfig] = useState({
    apiKey: "",
    databaseId: "",
    pageTitle: "",
  })
  const [isExportingToNotion, setIsExportingToNotion] = useState(false)
  const [notionDatabases, setNotionDatabases] = useState<Array<{ id: string; title: string }>>([])

  // Refs for MediaRecorder
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const intervalRef = useRef<NodeJS.Timeout | null>(null)


  // Handle theme mounting
  useEffect(() => {
    setMounted(true)
  }, [])

  // Load Notion config from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem("notionConfig");
    if (savedConfig) {
      setNotionConfig(JSON.parse(savedConfig));
    }
  }, []);

  // Save Notion config to localStorage whenever it changes
  useEffect(() => {
    if (notionConfig.apiKey && notionConfig.databaseId) {
      localStorage.setItem("notionConfig", JSON.stringify(notionConfig));
    } else {
      localStorage.removeItem("notionConfig");
    }
  }, [notionConfig]);


  // Auto-scroll to bottom of transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [transcript])

  // Meeting timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null; // Initialize to null
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setMeetingDuration((prev) => prev + 1)
      }, 1000)
    }
    return () => {
      if (interval) { // Clear if interval exists
        clearInterval(interval);
      }
    }
  }, [isRecording, isPaused])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' })

      audioChunksRef.current = []
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorderRef.current.onstop = async () => {
        setIsProcessing(true); // Start processing state
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();

        try {
          const { success, summary, action_items, transcript: backendTranscript, error } = await window.electronAPI.sendAudioForAnalysis(arrayBuffer);

          if (success) {
            // Convert backend's single string transcript to TranscriptEntry[]
            setTranscript(backendTranscript ? [{ id: "1", speaker: "AI", text: backendTranscript, timestamp: formatTime(0), confidence: 1 }] : []);
            setSummary(summary || null);

            // Map backend's action_items to your new Task interface
            const mappedTasks: Task[] = action_items?.map((item: any, index: number) => ({
              id: String(index), // Generate a simple ID
              title: item.task,
              assignee: item.owner,
              priority: "medium", // Default, as backend doesn't provide this
              completed: false,
              dueDate: item.deadline === "Not specified" ? undefined : item.deadline,
            })) || [];
            setTasks(mappedTasks);

            toast.success("Analysis complete!", {
              description: "Meeting summary and action items are ready."
            });
          } else {
            console.error("Analysis failed:", error);
            toast.error(`Analysis failed: ${error}`);
          }
        } catch (ipcError: any) {
          console.error("IPC call failed:", ipcError);
          toast.error(`Error during analysis: ${ipcError.message}`);
        } finally {
          setIsProcessing(false); // End processing state
        }
      }

      mediaRecorderRef.current.start()
      setIsRecording(true)
      setIsPaused(false) // Ensure not paused when starting
      setMeetingDuration(0) // Reset duration on new recording
      setTranscript([]) // Clear previous data
      setSummary(null)
      setTasks([])

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(() => {
        setMeetingDuration((prev) => prev + 1)
      }, 1000)

      toast.info("Recording started!")
    } catch (error) {
      console.error("Error starting recording:", error)
      toast.error(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsPaused(false) // Ensure not paused when stopping
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      toast.info("Recording stopped. Analyzing audio...")
    }
  }

  const handlePauseResume = () => {
    if (mediaRecorderRef.current) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        toast.info("Recording resumed.");
      } else {
        mediaRecorderRef.current.pause();
        toast.info("Recording paused.");
      }
      setIsPaused(!isPaused);
    }
  }

  const toggleTaskComplete = (taskId: string) => {
    setTasks(tasks.map((task) => (task.id === taskId ? { ...task, completed: !task.completed } : task)))
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-500"
      case "medium":
        return "bg-yellow-500"
      case "low":
        return "bg-green-500"
      default:
        return "bg-gray-500"
    }
  }

  const handleNotionExport = async () => {
    if (!summary || tasks.length === 0) {
      toast.error("No summary or action items to export.");
      return;
    }
    if (!notionConfig.apiKey || !notionConfig.databaseId) {
      toast.error("Please configure your Notion API Key and Database ID.");
      setIsNotionDialogOpen(true); // Open dialog if config is missing
      return;
    }

    setIsExportingToNotion(true);
    try {
      const { success, error, pageId } = await window.electronAPI.exportToNotion(notionConfig, {
        summary: summary || "", // Ensure summary is a string
        tasks: tasks, // Pass tasks in their new format
        transcript: transcript.map(t => t.text).join(" "), // Join transcript entries into a single string
        meetingDuration: formatTime(meetingDuration),
        participants: [], // Assuming participants are not extracted by current backend, or if they are, you'd populate this.
      });

      if (success) {
        toast.success("Meeting data exported to Notion successfully!", {
          action: pageId ? {
            label: "View in Notion",
            onClick: () => window.open(`https://www.notion.so/${pageId.replace(/-/g, "")}`, "_blank"),
          } : undefined,
        });
        setIsNotionDialogOpen(false); // Close dialog on success
      } else {
        toast.error(`Notion export failed: ${error}`);
      }
    } catch (error: any) {
      toast.error(`Error exporting to Notion: ${error.message}`);
      console.error("Notion export error:", error);
    } finally {
      setIsExportingToNotion(false);
    }
  };


  const fetchNotionDatabases = async () => {
    if (!notionConfig.apiKey) {
      toast.error("Please enter your Notion API Key to fetch databases.");
      setNotionDatabases([]); // Clear previous databases if key is empty
      return;
    }
    try {
      const { success, databases, error } = await window.electronAPI.fetchNotionDatabases(notionConfig.apiKey);
      if (success && databases) {
        setNotionDatabases(databases);
        toast.success("Notion databases loaded!");
      } else {
        toast.error(`Failed to load Notion databases: ${error}`);
        console.error("Failed to load Notion databases:", error);
        setNotionDatabases([]);
      }
    } catch (error: any) {
      toast.error(`Error fetching Notion databases: ${error.message}`);
      console.error("Error fetching Notion databases:", error);
      setNotionDatabases([]);
    }
  };


  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 -z-10">
        {/* Light mode background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 dark:opacity-0 transition-opacity duration-1000">
          <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl animate-float"></div>
          <div className="absolute top-1/2 right-0 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-float-delayed"></div>
          <div className="absolute bottom-0 left-1/3 w-72 h-72 bg-gradient-to-br from-cyan-400/20 to-blue-400/20 rounded-full blur-3xl animate-float-slow"></div>
        </div>

        {/* Dark mode background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 opacity-0 dark:opacity-100 transition-opacity duration-1000">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-600/10 to-purple-600/10 rounded-full blur-3xl animate-float"></div>
          <div className="absolute top-1/2 left-0 w-80 h-80 bg-gradient-to-br from-purple-600/10 to-pink-600/10 rounded-full blur-3xl animate-float-delayed"></div>
          <div className="absolute bottom-0 right-1/3 w-72 h-72 bg-gradient-to-br from-cyan-600/10 to-blue-600/10 rounded-full blur-3xl animate-float-slow"></div>

          {/* Animated particles */}
          <div className="absolute inset-0">
            <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-blue-400/30 rounded-full animate-pulse-slow"></div>
            <div className="absolute top-3/4 left-3/4 w-1 h-1 bg-purple-400/40 rounded-full animate-pulse-slower"></div>
            <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-cyan-400/30 rounded-full animate-pulse-slow"></div>
            <div className="absolute top-1/3 right-1/4 w-1 h-1 bg-pink-400/30 rounded-full animate-pulse-slower"></div>
          </div>
        </div>

        {/* Mesh gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent dark:via-black/5 animate-shimmer"></div>
      </div>

      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50 transition-colors duration-300">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <Brain className="h-8 w-8 text-blue-600 animate-pulse-gentle" />
                  <div className="absolute inset-0 h-8 w-8 text-blue-600 animate-ping opacity-20">
                    <Brain className="h-8 w-8" />
                  </div>
                </div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 bg-clip-text text-transparent animate-gradient-x bg-[length:200%_auto]">
                  MeetingAI
                </h1>
              </div>
              {isRecording && (
                <Badge
                  variant="secondary"
                  className="animate-pulse bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                >
                  <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse" />
                  LIVE
                </Badge>
              )}
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-sm text-muted-foreground">Duration: {formatTime(meetingDuration)}</div>

              {/* Theme Toggle */}
              {mounted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="relative overflow-hidden group transition-all duration-300 hover:scale-105"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4 text-yellow-500 transition-transform duration-300 group-hover:rotate-180" />
                  ) : (
                    <Moon className="h-4 w-4 text-blue-600 transition-transform duration-300 group-hover:-rotate-12" />
                  )}
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className="hover:scale-105 transition-transform duration-200 bg-transparent"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Rest of the component remains the same, but update the main container */}
      <div className="container mx-auto px-6 py-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Controls */}
            <Card className="shadow-lg border-0 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm card-hover glass-enhanced">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    {!isRecording ? (
                      <Button
                        onClick={handleStartRecording}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      >
                        <Mic className="h-4 w-4 mr-2" />
                        Start Recording
                      </Button>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Button onClick={handlePauseResume} variant="outline">
                          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        </Button>
                        <Button onClick={handleStopRecording} variant="destructive">
                          <Square className="h-4 w-4 mr-2" />
                          Stop
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    <Button variant="outline" size="sm">
                      <Share2 className="h-4 w-4 mr-2" />
                      Share
                    </Button>
                    <Dialog open={isNotionDialogOpen} onOpenChange={setIsNotionDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-gradient-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 border-blue-200 hover:scale-105 transition-all duration-300 dark:from-blue-950/20 dark:to-purple-950/20 dark:hover:from-blue-900/30 dark:hover:to-purple-900/30"
                        >
                          <BookOpen className="h-4 w-4 mr-2" />
                          Export to Notion
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[500px]">
                        <DialogHeader>
                          <DialogTitle className="flex items-center space-x-2">
                            <BookOpen className="h-5 w-5 text-blue-600" />
                            <span>Export to Notion</span>
                          </DialogTitle>
                          <DialogDescription>
                            Export your meeting summary and tasks to a Notion database. Configure your Notion
                            integration below.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label htmlFor="notion-api-key">Notion API Key</Label>
                            <Input
                              id="notion-api-key"
                              type="password"
                              placeholder="secret_..."
                              value={notionConfig.apiKey}
                              onChange={(e) => setNotionConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                              onBlur={fetchNotionDatabases} // Fetch databases when API key is entered
                            />
                            <p className="text-xs text-muted-foreground">
                              Get your API key from{" "}
                              <a
                                href="https://www.notion.so/my-integrations"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline inline-flex items-center"
                              >
                                Notion Integrations
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </a>
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="notion-database">Database</Label>
                            <Select
                              value={notionConfig.databaseId}
                              onValueChange={(value) => setNotionConfig((prev) => ({ ...prev, databaseId: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select a database" />
                              </SelectTrigger>
                              <SelectContent>
                                {notionDatabases.map((db) => (
                                  <SelectItem key={db.id} value={db.id}>
                                    {db.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Make sure your integration has access to the selected database
                            </p>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="page-title">Page Title</Label>
                            <Input
                              id="page-title"
                              placeholder={`Meeting Summary - ${new Date().toLocaleDateString()}`}
                              value={notionConfig.pageTitle}
                              onChange={(e) => setNotionConfig((prev) => ({ ...prev, pageTitle: e.target.value }))}
                            />
                          </div>

                          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4 space-y-2">
                            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                              What will be exported:
                            </h4>
                            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                              <li>• Meeting summary</li>
                              <li>• Action items with assignees and due dates</li>
                              <li>• Full transcript</li>
                              <li>• Meeting duration</li>
                            </ul>
                            <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                               Note: "Key points", "decisions", and "participants" from your original Summary interface are not currently exported as your backend provides a single string summary.
                            </p>
                          </div>
                        </div>

                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsNotionDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button
                            onClick={handleNotionExport}
                            disabled={!notionConfig.apiKey || !notionConfig.databaseId || isExportingToNotion || !summary}
                            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                          >
                            {isExportingToNotion ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Exporting...
                              </>
                            ) : (
                              <>
                                <BookOpen className="h-4 w-4 mr-2" />
                                Export to Notion
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                {isProcessing && (
                  <div className="mt-4">
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground mb-2">
                      <Zap className="h-4 w-4 animate-pulse" />
                      Processing with AI...
                    </div>
                    <Progress value={65} className="h-2" /> {/* Placeholder progress */}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm glass-enhanced">
                <TabsTrigger value="transcript" className="flex items-center space-x-2">
                  <FileText className="h-4 w-4" />
                  <span>Transcript</span>
                </TabsTrigger>
                <TabsTrigger value="summary" className="flex items-center space-x-2">
                  <Brain className="h-4 w-4" />
                  <span>AI Summary</span>
                </TabsTrigger>
                <TabsTrigger value="tasks" className="flex items-center space-x-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Tasks</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="transcript" className="mt-6">
                <Card className="shadow-lg border-0 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm card-hover glass-enhanced">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <FileText className="h-5 w-5" />
                      Full Transcript
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea ref={scrollRef} className="h-[400px] pr-4">
                      {transcript.length > 0 ? (
                        transcript.map((entry) => (
                          <div key={entry.id} className="mb-2 text-sm leading-relaxed">
                            <span className="font-semibold text-primary">[{entry.timestamp}] {entry.speaker}:</span>{" "}
                            {entry.text}
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-center py-10">
                          Start recording to see the live transcript here.
                        </p>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="summary" className="mt-6">
                <Card className="shadow-lg border-0 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm card-hover glass-enhanced">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Brain className="h-5 w-5" />
                      AI Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {summary ? (
                      <div className="space-y-3">
                        <p className="text-sm leading-relaxed">{summary}</p>
                        {/* If backend provided structured data, you would map it here */}
                        {/* {summary.keyPoints && summary.keyPoints.length > 0 && (
                          <div>
                            <h3 className="font-semibold text-base mb-1">Key Points:</h3>
                            <ul className="list-disc list-inside text-sm space-y-1">
                              {summary.keyPoints.map((point, i) => (
                                <li key={i}>{point}</li>
                              ))}
                            </ul>
                          </div>
                        )} */}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-10">
                        Summary will appear after recording stops and analysis is complete.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tasks" className="mt-6">
                <Card className="shadow-lg border-0 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm card-hover glass-enhanced">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Zap className="h-5 w-5" />
                      Action Items
                      <Badge variant="secondary" className="ml-2">
                        {tasks.filter((t) => !t.completed).length} pending
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[400px] pr-4">
                      {tasks.length > 0 ? (
                        <div className="space-y-3">
                          {tasks.map((task) => (
                            <div
                              key={task.id}
                              className="flex items-start p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                              onClick={() => toggleTaskComplete(task.id)}
                            >
                              <div className="mr-3 mt-1">
                                {task.completed ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                                ) : (
                                  <Circle className="h-5 w-5 text-gray-400" />
                                )}
                              </div>
                              <div className="flex-1">
                                <p className={`text-sm font-medium ${task.completed ? "line-through text-muted-foreground" : ""}`}>
                                  {task.title}
                                </p>
                                <div className="flex items-center text-xs text-muted-foreground mt-1 space-x-3">
                                  {task.assignee && (
                                    <span className="flex items-center">
                                      <Users className="h-3 w-3 mr-1" /> {task.assignee}
                                    </span>
                                  )}
                                  {task.dueDate && (
                                    <span className="flex items-center">
                                      <Clock className="h-3 w-3 mr-1" /> {task.dueDate}
                                    </span>
                                  )}
                                  {task.priority && (
                                    <Badge style={{ backgroundColor: getPriorityColor(task.priority) }} className="text-white">
                                      {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-center py-10">
                          No action items identified yet.
                        </p>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Column: Quick Stats */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="shadow-lg border-0 bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm card-hover glass-enhanced">
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Meeting duration</span>
                  <span className="font-medium">{formatTime(meetingDuration)}</span>
                </div>
                {/* Note: "Words spoken" and "Key points" are based on mock data and not directly from your current backend analysis output. */}
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Action items</span>
                  <span className="font-medium">{tasks.length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Completed</span>
                  <span className="font-medium">{tasks.filter((t) => t.completed).length}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}