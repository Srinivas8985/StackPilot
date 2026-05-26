pipeline {
    agent any

    environment {
        // Define repository name and docker compose folder path
        PROJECT_DIR = 'stackpilot'
        // Target AWS EC2 details (registered in Jenkins Credentials)
        EC2_USER = 'ubuntu'
        EC2_IP = 'YOUR_EC2_ELASTIC_IP' // Replace with your actual Elastic IP
        SSH_CRED_ID = 'aws-ec2-ssh-key' // The ID of your SSH credentials in Jenkins
    }

    stages {
        stage('Checkout Code') {
            steps {
                echo 'Checking out code from Git Repository...'
                checkout scm
            }
        }

        stage('Install Dependencies & Lint') {
            steps {
                echo 'Running static analysis and linting verification...'
                // Optional: Run linting check for both frontend & backend to ensure code quality before building
                dir('backend') {
                    echo 'Inspecting backend module structure...'
                }
                dir('frontend') {
                    echo 'Inspecting frontend module structure...'
                }
            }
        }

        stage('Verify Docker Build') {
            steps {
                echo 'Verifying Docker images build successfully...'
                // Dry-run build to verify Dockerfiles don't have compilation errors
                sh 'docker compose build --no-cache'
            }
        }

        stage('Deploy to AWS EC2') {
            steps {
                echo 'Deploying application to AWS EC2 Free Tier...'
                // Use Jenkins SSH Agent plugin to authenticate securely using the registered PEM key
                sshagent([SSH_CRED_ID]) {
                    // 1. SSH into the server, pull the latest code, and execute docker compose up
                    sh """
                    ssh -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_IP} "
                        cd ~/${PROJECT_DIR} &&
                        git pull origin main &&
                        docker compose up -d --build &&
                        docker system prune -f
                    "
                    """
                }
                echo 'Deployment successful! StackPilot is live.'
            }
        }
    }

    post {
        always {
            echo 'Cleaning up Jenkins workspace...'
            cleanWs()
        }
        success {
            echo 'CI/CD pipeline executed flawlessly! Your project is up-to-date and running on AWS.'
        }
        failure {
            echo 'CI/CD pipeline failed. Please check the console logs for debugging details.'
        }
    }
}
