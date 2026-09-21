.PHONY: docker-build docker-run

docker-build:
	docker build -t polyrepo:latest -f ./Dockerfile .

docker-run:
	docker run -p 3000:80 -it polyrepo:latest
