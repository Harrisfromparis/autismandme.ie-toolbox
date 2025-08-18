import { useState } from 'react'
import { useKV } from '@github/spark/hooks'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'sonner'
import { 
  GraduationCap, 
  User, 
  LogOut, 
  Mail, 
  BookOpen, 
  Star,
  Play,
  CheckCircle,
  Calculator,
  PieChart,
  TrendingUp,
  Award
} from '@phosphor-icons/react'

interface User {
  id: string
  name: string
  email: string
  role: 'student' | 'teacher'
  grade?: string
  school?: string
}

interface Lesson {
  id: string
  title: string
  description: string
  grade: string
  topic: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  duration: number
  completed: boolean
  progress: number
  posterImage: string
  punTitle: string
}

// Sample lessons with math puns and movie poster style
const sampleLessons: Lesson[] = [
  {
    id: '1',
    title: 'Basic Addition',
    description: 'Learn fundamental addition skills',
    grade: 'junior-primary',
    topic: 'arithmetic',
    difficulty: 'beginner',
    duration: 20,
    completed: false,
    progress: 0,
    posterImage: '🔢',
    punTitle: 'The Sum-Thing Special'
  },
  {
    id: '2',
    title: 'Multiplication Tables',
    description: 'Master your times tables',
    grade: 'senior-primary',
    topic: 'arithmetic',
    difficulty: 'intermediate',
    duration: 30,
    completed: false,
    progress: 45,
    posterImage: '✖️',
    punTitle: 'Times of Our Lives'
  },
  {
    id: '3',
    title: 'Fractions Fundamentals',
    description: 'Understanding parts of a whole',
    grade: 'senior-primary',
    topic: 'fractions',
    difficulty: 'intermediate',
    duration: 25,
    completed: true,
    progress: 100,
    posterImage: '🥧',
    punTitle: 'A Piece of the Action'
  },
  {
    id: '4',
    title: 'Algebraic Expressions',
    description: 'Introduction to algebra concepts',
    grade: 'junior-cycle',
    topic: 'algebra',
    difficulty: 'advanced',
    duration: 40,
    completed: false,
    progress: 20,
    posterImage: '📐',
    punTitle: 'The X-Files: Variable Edition'
  },
  {
    id: '5',
    title: 'Geometry Basics',
    description: 'Shapes, angles, and measurements',
    grade: 'junior-cycle',
    topic: 'geometry',
    difficulty: 'intermediate',
    duration: 35,
    completed: false,
    progress: 0,
    posterImage: '📊',
    punTitle: 'Shape of Math'
  },
  {
    id: '6',
    title: 'Probability & Statistics',
    description: 'Data analysis and chance',
    grade: 'senior-cycle',
    topic: 'statistics',
    difficulty: 'advanced',
    duration: 45,
    completed: false,
    progress: 75,
    posterImage: '🎲',
    punTitle: 'Odds Are You\'ll Love This'
  }
]

const gradeCategories = [
  { id: 'junior-primary', name: 'Junior Primary', ages: 'Ages 4-8' },
  { id: 'senior-primary', name: 'Senior Primary', ages: 'Ages 8-12' },
  { id: 'junior-cycle', name: 'Junior Cycle', ages: 'Ages 12-15' },
  { id: 'senior-cycle', name: 'Senior Cycle', ages: 'Ages 15-18' }
]

function LoginForm({ onLogin }: { onLogin: (user: User) => void }) {
  const [role, setRole] = useState<'student' | 'teacher'>('student')
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    grade: '',
    school: ''
  })

  const handleLogin = () => {
    if (!formData.name || !formData.email) {
      toast.error('Please fill in all required fields')
      return
    }

    const user: User = {
      id: Date.now().toString(),
      name: formData.name,
      email: formData.email,
      role,
      grade: role === 'student' ? formData.grade : undefined,
      school: formData.school
    }

    onLogin(user)
    toast.success(`Welcome to MathFlix, ${formData.name}!`)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-primary mb-2">MathFlix</h1>
            <p className="text-muted-foreground">Irish Mathematics Education Platform</p>
          </div>

          <Tabs value={role} onValueChange={(value) => setRole(value as 'student' | 'teacher')}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="student">Student</TabsTrigger>
              <TabsTrigger value="teacher">Teacher</TabsTrigger>
            </TabsList>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter your full name"
                />
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter your email"
                />
              </div>

              {role === 'student' && (
                <div>
                  <Label htmlFor="grade">Grade Level</Label>
                  <select
                    id="grade"
                    className="w-full p-2 rounded-md border border-input bg-background"
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  >
                    <option value="">Select Grade Level</option>
                    {gradeCategories.map(grade => (
                      <option key={grade.id} value={grade.id}>{grade.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label htmlFor="school">School (Optional)</Label>
                <Input
                  id="school"
                  value={formData.school}
                  onChange={(e) => setFormData({ ...formData, school: e.target.value })}
                  placeholder="Enter your school name"
                />
              </div>

              <Button onClick={handleLogin} className="w-full">
                <GraduationCap className="mr-2" />
                Start Learning
              </Button>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

function LessonCard({ lesson, onLessonClick }: { lesson: Lesson; onLessonClick: (lesson: Lesson) => void }) {
  return (
    <Card 
      className="group cursor-pointer transition-all duration-300 hover:scale-105 hover:ring-2 hover:ring-primary/50 min-w-[200px] aspect-[2/3] bg-card overflow-hidden"
      onClick={() => onLessonClick(lesson)}
    >
      <CardContent className="p-0 h-full flex flex-col">
        <div className="flex-1 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-6xl">
          {lesson.posterImage}
        </div>
        <div className="p-3 space-y-2">
          <h3 className="font-semibold text-sm group-hover:text-primary transition-colors">
            {lesson.punTitle}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2">{lesson.description}</p>
          
          <div className="flex items-center justify-between text-xs">
            <Badge variant={lesson.difficulty === 'beginner' ? 'secondary' : lesson.difficulty === 'intermediate' ? 'default' : 'destructive'}>
              {lesson.difficulty}
            </Badge>
            <span className="text-muted-foreground">{lesson.duration}min</span>
          </div>
          
          {lesson.progress > 0 && (
            <div className="space-y-1">
              <Progress value={lesson.progress} className="h-1" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{lesson.progress}%</span>
                {lesson.completed && <CheckCircle className="text-accent" size={14} />}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StudentDashboard({ user, lessons, onLessonClick, onLogout }: {
  user: User
  lessons: Lesson[]
  onLessonClick: (lesson: Lesson) => void
  onLogout: () => void
}) {
  const userGradeLessons = lessons.filter(lesson => lesson.grade === user.grade)
  const completedLessons = userGradeLessons.filter(lesson => lesson.completed)
  const inProgressLessons = userGradeLessons.filter(lesson => lesson.progress > 0 && !lesson.completed)
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-primary">MathFlix</h1>
            <Badge variant="secondary">Student</Badge>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">
                {gradeCategories.find(g => g.id === user.grade)?.name}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-8">
        {/* Progress Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-accent/20 rounded-lg">
                <CheckCircle className="text-accent" size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedLessons.length}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <BookOpen className="text-primary" size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">{inProgressLessons.length}</p>
                <p className="text-sm text-muted-foreground">In Progress</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Star className="text-yellow-500" size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">{userGradeLessons.length}</p>
                <p className="text-sm text-muted-foreground">Available</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Continue Learning */}
        {inProgressLessons.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Continue Learning</h2>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {inProgressLessons.map(lesson => (
                <LessonCard key={lesson.id} lesson={lesson} onLessonClick={onLessonClick} />
              ))}
            </div>
          </section>
        )}

        {/* Lessons by Grade */}
        <section>
          <h2 className="text-xl font-semibold mb-4">
            {gradeCategories.find(g => g.id === user.grade)?.name} Lessons
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {userGradeLessons.map(lesson => (
              <LessonCard key={lesson.id} lesson={lesson} onLessonClick={onLessonClick} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function TeacherDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [assignments] = useKV('teacher-assignments', [])
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-primary">MathFlix</h1>
            <Badge variant="default">Teacher</Badge>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="font-medium">{user.name}</p>
              <p className="text-sm text-muted-foreground">Teacher Portal</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              <LogOut />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-8">
        {/* Teacher Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <User className="text-primary" size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">24</p>
                <p className="text-sm text-muted-foreground">Students</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-accent/20 rounded-lg">
                <BookOpen className="text-accent" size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">12</p>
                <p className="text-sm text-muted-foreground">Assignments</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Mail className="text-yellow-500" size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">8</p>
                <p className="text-sm text-muted-foreground">Pending Review</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <TrendingUp className="text-purple-500" size={24} />
              </div>
              <div>
                <p className="text-2xl font-bold">87%</p>
                <p className="text-sm text-muted-foreground">Avg. Score</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Button className="h-24 flex flex-col gap-2">
            <BookOpen size={24} />
            <span>Create Assignment</span>
          </Button>
          
          <Button variant="secondary" className="h-24 flex flex-col gap-2">
            <PieChart size={24} />
            <span>View Analytics</span>
          </Button>
          
          <Button variant="secondary" className="h-24 flex flex-col gap-2">
            <Mail size={24} />
            <span>Email Results</span>
          </Button>
          
          <Button variant="secondary" className="h-24 flex flex-col gap-2">
            <Award size={24} />
            <span>Grade Work</span>
          </Button>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recent Student Activity</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-medium">Sarah O'Connor</p>
                  <p className="text-sm text-muted-foreground">Completed "Basic Addition" - Score: 95%</p>
                </div>
                <Badge variant="default">New</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-medium">Liam Murphy</p>
                  <p className="text-sm text-muted-foreground">Started "Multiplication Tables" - Progress: 30%</p>
                </div>
                <Badge variant="secondary">In Progress</Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-medium">Emma Walsh</p>
                  <p className="text-sm text-muted-foreground">Submitted "Fractions Fundamentals" for review</p>
                </div>
                <Badge variant="destructive">Needs Review</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function LessonPlayer({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const [currentUser] = useKV<User>('current-user', null)
  const [progress, setProgress] = useState(lesson.progress)
  
  const handleCompleteLesson = () => {
    setProgress(100)
    toast.success(`Lesson "${lesson.title}" completed!`)
    
    // Email functionality would go here
    if (currentUser?.email) {
      toast.success('Results emailed to your teacher!')
    }
    
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-3xl">{lesson.posterImage}</span>
            <div>
              <h2 className="text-xl">{lesson.punTitle}</h2>
              <p className="text-sm text-muted-foreground">{lesson.description}</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 bg-card rounded-lg p-6 space-y-6">
          <div className="text-center space-y-4">
            <div className="text-6xl">{lesson.posterImage}</div>
            <h3 className="text-2xl font-bold">{lesson.title}</h3>
            <p className="text-muted-foreground">{lesson.description}</p>
          </div>
          
          {/* Lesson Content Placeholder */}
          <div className="bg-muted/50 rounded-lg p-8 text-center">
            <Calculator size={48} className="mx-auto mb-4 text-primary" />
            <h4 className="text-lg font-semibold mb-2">Interactive Lesson Content</h4>
            <p className="text-muted-foreground mb-6">
              This is where the actual lesson content, exercises, and interactive elements would be displayed.
              Content would be sourced from open educational resources aligned with Irish curriculum standards.
            </p>
            
            {/* Sample question */}
            <div className="bg-background p-4 rounded-lg space-y-3">
              <p className="font-medium">Sample Question:</p>
              <p>What is 7 × 8?</p>
              <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                <Button variant="outline">54</Button>
                <Button variant="outline" className="bg-accent text-accent-foreground">56</Button>
                <Button variant="outline">58</Button>
                <Button variant="outline">62</Button>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Progress</span>
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} />
          </div>
          
          <div className="flex gap-3">
            <Button onClick={handleCompleteLesson} className="flex-1">
              <CheckCircle className="mr-2" />
              Complete Lesson
            </Button>
            <Button variant="outline" onClick={onClose}>
              Save & Exit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function App() {
  const [currentUser, setCurrentUser] = useKV<User | null>('current-user', null)
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)

  const handleLogin = (user: User) => {
    setCurrentUser(user)
  }

  const handleLogout = () => {
    setCurrentUser(null)
    toast.success('Logged out successfully')
  }

  const handleLessonClick = (lesson: Lesson) => {
    setSelectedLesson(lesson)
  }

  if (!currentUser) {
    return (
      <>
        <LoginForm onLogin={handleLogin} />
        <Toaster />
      </>
    )
  }

  return (
    <>
      {currentUser.role === 'student' ? (
        <StudentDashboard 
          user={currentUser} 
          lessons={sampleLessons}
          onLessonClick={handleLessonClick}
          onLogout={handleLogout}
        />
      ) : (
        <TeacherDashboard 
          user={currentUser} 
          onLogout={handleLogout}
        />
      )}
      
      {selectedLesson && (
        <LessonPlayer 
          lesson={selectedLesson} 
          onClose={() => setSelectedLesson(null)} 
        />
      )}
      
      <Toaster />
    </>
  )
}

export default App